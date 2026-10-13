"""Trip planning orchestration: routes -> checkpoints -> weather -> risk -> recommendation."""
import uuid
from datetime import datetime, timedelta

from django.core.cache import cache

from . import geo, hos, risk, services

ROUTE_COLORS = ["#2563eb", "#9333ea", "#ea580c"]


def _weather_at(h, i):
    rain = services.val(h.get("rain"), i) + services.val(h.get("showers"), i)
    return {
        "wind_mph": round(services.val(h.get("wind_speed_10m"), i), 1),
        "gust_mph": round(services.val(h.get("wind_gusts_10m"), i), 1),
        "precip_in_hr": round(services.val(h.get("precipitation"), i), 3),
        "rain_in_hr": round(rain, 3),
        "snow_in_hr": round(services.val(h.get("snowfall"), i), 3),
    }


def _reason(rank, order, summaries, routes):
    """Why a route sits where it does: the first ranking criterion separating it from its neighbour."""
    i = order[rank]
    if len(order) == 1:
        return "Only one route was found between these places."
    other = order[1] if rank == 0 else order[0]
    name = routes[other]["out"]["name"]
    if rank > 0:
        prefix = "Ranked below"
    elif summaries[i]["has_no_travel"]:
        prefix = "Least bad, ranked above"
    else:
        prefix = "Recommended over"
    crit = risk.deciding_criterion(summaries[i], summaries[other])
    if crit is None:
        return f"Tied with {name} on every criterion."
    label, mine, theirs = crit
    return f"{prefix} {name}: {label} {mine} vs {theirs}."


PREP_TTL = 3600


def prepare_trip(origin: str, destination: str, departure, load_lb: float, interval_mi: int) -> dict:
    """Geocode, route, place checkpoints and work out ETAs. Everything except the weather.

    The result is cached under its plan_id so the weather can be supplied by a later request.
    """
    o = services.geocode(origin)
    d = services.geocode(destination)
    if geo.haversine_mi((o["lon"], o["lat"]), (d["lon"], d["lat"])) < 1.0:
        raise services.InputError("Origin and destination are the same place.")
    raw_routes, provider = services.get_routes(o, d, load_lb)
    if not raw_routes:
        raise services.UpstreamError("No route found")

    routes = []
    all_points = []
    for idx, rr in enumerate(raw_routes):
        cm, cs = geo.cumulative(rr["coords"], rr["seg_durations"])
        cps = geo.sample_along(rr["coords"], cm, cs, interval_mi, rr["duration_s"])
        # ETAs are clock times: driving time plus the HOS breaks/rests taken before reaching the point.
        stops = hos.plan_stops(rr["duration_s"])
        for cp in cps:
            cp["eta"] = departure + timedelta(seconds=hos.wall_elapsed(cp["elapsed_s"], stops))
            cp["_wx"] = len(all_points)
            all_points.append((cp["lat"], cp["lon"]))
        out_stops = []
        for st in stops:
            pos = geo.point_at_elapsed(rr["coords"], cm, cs, st["drive_s"], rr["duration_s"])
            start = departure + timedelta(seconds=hos.wall_elapsed(st["drive_s"], stops))
            out_stops.append({
                "kind": st["kind"], "lat": round(pos["lat"], 5), "lon": round(pos["lon"], 5),
                "mile": round(pos["mile"], 1), "duration_s": st["duration_s"],
                "start": start.isoformat(), "end": (start + timedelta(seconds=st["duration_s"])).isoformat(),
            })
        trip_s = hos.wall_elapsed(rr["duration_s"], stops)
        routes.append({"raw": rr, "checkpoints": cps, "stops": out_stops, "trip_s": trip_s})

    max_eta = max(r["checkpoints"][-1]["eta"] for r in routes)
    horizon = services.forecast_horizon()
    if max_eta > horizon:
        raise services.InputError(
            f"Trip would arrive {max_eta:%Y-%m-%d %H:%M} UTC, beyond the weather forecast horizon "
            f"({horizon:%Y-%m-%d %H:%M} UTC). Choose an earlier departure.")
    state = {
        "plan_id": uuid.uuid4().hex, "provider": provider, "origin": o, "destination": d,
        "departure": departure, "load_lb": load_lb, "interval_mi": interval_mi,
        "routes": routes, "points": all_points, "max_eta": max_eta,
    }
    cache.set(f"prep:{state['plan_id']}", state, PREP_TTL)
    return state


def weather_request(state: dict) -> dict:
    return {"plan_id": state["plan_id"],
            "weather": services.weather_request(state["points"], state["departure"], state["max_eta"])}


def load_prepared(plan_id: str) -> dict | None:
    return cache.get(f"prep:{plan_id}")


def score_trip(state: dict, times, hourly) -> dict:
    """Apply hourly forecasts (one per checkpoint, in state['points'] order) and rank the routes."""
    routes, departure, load_lb = state["routes"], state["departure"], state["load_lb"]
    summaries = []
    for idx, r in enumerate(routes):
        cps = r["checkpoints"]
        seg = geo.segment_miles([c["mile"] for c in cps])
        segments, out_cps = [], []
        for c, miles in zip(cps, seg):
            # Weather is interpolated between the two forecast hours around the ETA.
            x = services.fractional_index(times, c["eta"])
            hi = round(x)
            wx = _weather_at(hourly[c["_wx"]], x)
            rk = risk.checkpoint_risk(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], load_lb)
            segments.append(risk.Segment(miles, rk["level"]))
            out_cps.append({
                "lat": round(c["lat"], 5), "lon": round(c["lon"], 5),
                "mile": round(c["mile"], 1), "segment_miles": round(miles, 2),
                "eta": c["eta"].isoformat(), "forecast_hour": times[hi].isoformat() if hi >= 0 else None,
                "weather": wx, "risk": rk,
            })
        s = risk.summarize(segments, r["trip_s"])
        summaries.append(s)
        r["out"] = {
            "id": idx, "name": f"Route {chr(65 + idx)}", "color": ROUTE_COLORS[idx % 3],
            "distance_mi": round(r["raw"]["distance_m"] / geo.METERS_PER_MILE, 1),
            "duration_s": round(r["raw"]["duration_s"]),  # driving time
            "trip_duration_s": round(r["trip_s"]),  # driving + HOS breaks/rests
            "arrival": (departure + timedelta(seconds=r["trip_s"])).isoformat(),
            "stops": r["stops"],
            "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in geo.simplify(r["raw"]["coords"])]},
            "checkpoints": out_cps, "summary": s,
        }

    order = risk.rank_routes(summaries)
    out_routes = []
    for rank, i in enumerate(order):
        ro = routes[i]["out"]
        ro["rank"] = rank + 1
        ro["recommended"] = rank == 0 and not summaries[i]["has_no_travel"]
        ro["reason"] = _reason(rank, order, summaries, routes)
        out_routes.append(ro)
    out_routes.sort(key=lambda x: x["id"])

    plan_id = state["plan_id"]
    cache.set(f"plan:{plan_id}", {
        "departure": departure.isoformat(), "load_lb": load_lb,
        "lines": [r["raw"]["coords"] for r in routes],
    }, 3600)

    all_blocked = all(s["has_no_travel"] for s in summaries)
    return {
        "plan_id": plan_id,
        "provider": state["provider"],
        "origin": state["origin"], "destination": state["destination"],
        "departure": departure.isoformat(), "load_lb": load_lb, "interval_mi": state["interval_mi"],
        "recommended_route_id": None if all_blocked else order[0],
        "warning": "Every route has No Travel conditions; consider delaying departure." if all_blocked else None,
        "routes": out_routes,
    }


def plan_trip(origin: str, destination: str, departure, load_lb: float, interval_mi: int) -> dict:
    """One-step planning with the server fetching the weather itself."""
    state = prepare_trip(origin, destination, departure, load_lb, interval_mi)
    times, hourly = services.fetch_hourly(state["points"], departure, state["max_eta"])
    return score_trip(state, times, hourly)


HEAT_HOURS = 48


def _heat_grid(plan: dict, spacing_mi: float = 20.0, lateral_mi: float = 30.0):
    """Points on and either side of every route (de-duplicated), and the disc radius to draw them with."""
    total = sum(geo.cumulative(l, [])[0][-1] for l in plan["lines"])
    # Keep the grid to roughly 450 points or fewer.
    spacing = max(spacing_mi, total / 150)
    # Each point is drawn as a disc wide enough to overlap its neighbours (along the route and sideways).
    radius_mi = 0.9 * max(spacing, lateral_mi)
    grid = {}
    cell = spacing / 69.0 * 0.8  # degrees, for de-duplication
    for line in plan["lines"]:
        cm, cs = geo.cumulative(line, [])
        pts = geo.sample_along(line, cm, cs, spacing)
        for k, p in enumerate(pts):
            nxt = pts[min(k + 1, len(pts) - 1)]
            prv = pts[max(k - 1, 0)]
            brg = geo.bearing((prv["lon"], prv["lat"]), (nxt["lon"], nxt["lat"]))
            cands = [(p["lon"], p["lat"])]
            for side in (90, -90):
                cands.append(geo.offset_point(p["lon"], p["lat"], brg + side, lateral_mi))
            for lon, lat in cands:
                keyc = (round(lat / cell), round(lon / cell))
                grid.setdefault(keyc, (lat, lon))
    return list(grid.values()), radius_mi


def heatmap_request(plan_id: str) -> dict | None:
    """What a client needs to fetch the heatmap's forecast itself."""
    plan = cache.get(f"plan:{plan_id}")
    if not plan:
        return None
    points, _ = _heat_grid(plan)
    departure = datetime.fromisoformat(plan["departure"])
    return {"plan_id": plan_id,
            "weather": services.weather_request(points, departure, departure + timedelta(hours=HEAT_HOURS))}


def heatmap(plan_id: str, weather: dict | None = None) -> dict | None:
    """Hourly corridor grid for 0-48 h. `weather` is client-fetched data; without it the server fetches."""
    plan = cache.get(f"plan:{plan_id}")
    if not plan:
        return None
    departure = datetime.fromisoformat(plan["departure"])
    load_lb = plan["load_lb"]
    points, radius_mi = _heat_grid(plan)
    if weather is None:
        times, hourly = services.fetch_hourly(points, departure, departure + timedelta(hours=HEAT_HOURS))
    else:
        times, hourly = services.parse_client_weather(weather, len(points))
    hours = HEAT_HOURS
    i0 = services.nearest_index(times, departure)
    # Slider step h is forecast hour times[i0 + h]. Hours past the forecast horizon are dropped.
    n = max(0, min(hours + 1, len(times) - i0)) if i0 >= 0 else 0
    hour_labels = [times[i0 + h].isoformat() for h in range(n)]
    risk_m, wind_m, rain_m, snow_m = [], [], [], []
    for h in range(n):
        idx = i0 + h
        rr, ww, ra, sn = [], [], [], []
        for hp in hourly:
            wx = _weather_at(hp, idx)
            rk = risk.checkpoint_risk(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], load_lb)
            rr.append(rk["level"]); ww.append(wx["wind_mph"]); ra.append(wx["rain_in_hr"]); sn.append(wx["snow_in_hr"])
        risk_m.append(rr); wind_m.append(ww); rain_m.append(ra); snow_m.append(sn)
    return {
        "plan_id": plan_id,
        "points": [[round(lon, 4), round(lat, 4)] for lat, lon in points],
        "radius_mi": round(radius_mi, 1),
        "departure": plan["departure"],
        "hours": hour_labels,
        "risk": risk_m, "wind_mph": wind_m, "rain_in_hr": rain_m, "snow_in_hr": snow_m,
    }
