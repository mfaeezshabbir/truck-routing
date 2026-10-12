"""Trip planning orchestration: routes -> checkpoints -> weather -> risk -> recommendation."""
import uuid
from datetime import timedelta

from django.core.cache import cache

from . import geo, risk, services

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


def plan_trip(origin: str, destination: str, departure, load_lb: float, interval_mi: int) -> dict:
    o = services.geocode(origin)
    d = services.geocode(destination)
    if geo.haversine_mi((o["lon"], o["lat"]), (d["lon"], d["lat"])) < 1.0:
        raise services.InputError("Origin and destination are the same place.")
    raw_routes, provider = services.get_routes(o, d)
    if not raw_routes:
        raise services.UpstreamError("No route found")

    routes = []
    all_points = []
    for idx, rr in enumerate(raw_routes):
        cm, cs = geo.cumulative(rr["coords"], rr["seg_durations"])
        cps = geo.sample_along(rr["coords"], cm, cs, interval_mi, rr["duration_s"])
        for cp in cps:
            cp["eta"] = departure + timedelta(seconds=cp["elapsed_s"])
            cp["_wx"] = len(all_points)
            all_points.append((cp["lat"], cp["lon"]))
        routes.append({"raw": rr, "checkpoints": cps})

    max_eta = max(r["checkpoints"][-1]["eta"] for r in routes)
    horizon = services.forecast_horizon()
    if max_eta > horizon:
        raise services.InputError(
            f"Trip would arrive {max_eta:%Y-%m-%d %H:%M} UTC, beyond the weather forecast horizon "
            f"({horizon:%Y-%m-%d %H:%M} UTC). Choose an earlier departure.")
    times, hourly = services.fetch_hourly(all_points, departure, max_eta)

    summaries = []
    for idx, r in enumerate(routes):
        cps = r["checkpoints"]
        seg = geo.segment_miles([c["mile"] for c in cps])
        segments, out_cps = [], []
        for c, miles in zip(cps, seg):
            hi = services.nearest_index(times, c["eta"])
            wx = _weather_at(hourly[c["_wx"]], hi)
            rk = risk.checkpoint_risk(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], load_lb)
            segments.append(risk.Segment(miles, rk["level"]))
            out_cps.append({
                "lat": round(c["lat"], 5), "lon": round(c["lon"], 5),
                "mile": round(c["mile"], 1), "segment_miles": round(miles, 2),
                "eta": c["eta"].isoformat(), "forecast_hour": times[hi].isoformat() if hi >= 0 else None,
                "weather": wx, "risk": rk,
            })
        s = risk.summarize(segments, r["raw"]["duration_s"])
        summaries.append(s)
        r["out"] = {
            "id": idx, "name": f"Route {chr(65 + idx)}", "color": ROUTE_COLORS[idx % 3],
            "distance_mi": round(r["raw"]["distance_m"] / geo.METERS_PER_MILE, 1),
            "duration_s": round(r["raw"]["duration_s"]),
            "arrival": (departure + timedelta(seconds=r["raw"]["duration_s"])).isoformat(),
            "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in geo.simplify(r["raw"]["coords"])]},
            "checkpoints": out_cps, "summary": s,
        }

    order = risk.rank_routes(summaries)
    out_routes = []
    for rank, i in enumerate(order):
        ro = routes[i]["out"]
        ro["rank"] = rank + 1
        ro["recommended"] = rank == 0 and not summaries[i]["has_no_travel"]
        out_routes.append(ro)
    out_routes.sort(key=lambda x: x["id"])

    plan_id = uuid.uuid4().hex
    cache.set(f"plan:{plan_id}", {
        "departure": departure.isoformat(), "load_lb": load_lb,
        "lines": [r["raw"]["coords"] for r in routes],
    }, 3600)

    all_blocked = all(s["has_no_travel"] for s in summaries)
    return {
        "plan_id": plan_id,
        "provider": provider,
        "origin": o, "destination": d,
        "departure": departure.isoformat(), "load_lb": load_lb, "interval_mi": interval_mi,
        "recommended_route_id": None if all_blocked else order[0],
        "warning": "Every route has No Travel conditions; consider delaying departure." if all_blocked else None,
        "routes": out_routes,
    }


def heatmap(plan_id: str, hours: int = 48, spacing_mi: float = 20.0, lateral_mi: float = 30.0) -> dict | None:
    plan = cache.get(f"plan:{plan_id}")
    if not plan:
        return None
    from datetime import datetime
    departure = datetime.fromisoformat(plan["departure"])
    load_lb = plan["load_lb"]

    total = sum(geo.cumulative(l, [])[0][-1] for l in plan["lines"])
    # keep the grid around <=450 points
    spacing = max(spacing_mi, total / 150)
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
    points = list(grid.values())
    end = departure + timedelta(hours=hours)
    times, hourly = services.fetch_hourly(points, departure, end)
    i0 = services.nearest_index(times, departure)
    # Slider step h shows forecast hour times[i0 + h] (the same "nearest hour" rule as checkpoint ETAs);
    # labels are those real forecast timestamps, and hours past the forecast horizon are dropped
    # rather than silently repeating the last hour.
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
        "departure": plan["departure"],
        "hours": hour_labels,
        "risk": risk_m, "wind_mph": wind_m, "rain_in_hr": rain_m, "snow_in_hr": snow_m,
    }
