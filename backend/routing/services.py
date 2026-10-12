"""External API clients: geocoding, routing (ORS / OSRM fallback), weather (Open-Meteo)."""
import logging
from datetime import datetime, timedelta, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from . import geo

log = logging.getLogger(__name__)
TIMEOUT = 30


class UpstreamError(Exception):
    pass


def _session():
    s = requests.Session()
    s.headers["User-Agent"] = settings.HTTP_USER_AGENT
    return s


# ---------------------------------------------------------------- geocoding
def geocode(query: str) -> dict:
    key = f"geo:{query.strip().lower()}"
    hit = cache.get(key)
    if hit:
        return hit
    if settings.ORS_API_KEY:
        r = _session().get(
            "https://api.openrouteservice.org/geocode/search",
            params={"api_key": settings.ORS_API_KEY, "text": query, "size": 1},
            timeout=TIMEOUT,
        )
        if r.ok and r.json().get("features"):
            f = r.json()["features"][0]
            res = {"lon": f["geometry"]["coordinates"][0], "lat": f["geometry"]["coordinates"][1],
                   "label": f["properties"].get("label", query)}
            cache.set(key, res, 86400)
            return res
    res = None
    try:
        r = _session().get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "us,ca,mx"},
            timeout=TIMEOUT,
        )
        if r.ok and r.json():
            data = r.json()[0]
            res = {"lon": float(data["lon"]), "lat": float(data["lat"]), "label": data.get("display_name", query)}
    except requests.RequestException as e:
        log.warning("Nominatim failed: %s", e)
    if res is None:
        # Fallback: Photon (Komoot), also OSM-based and free.
        r = _session().get("https://photon.komoot.io/api/", params={"q": query, "limit": 1}, timeout=TIMEOUT)
        feats = r.json().get("features", []) if r.ok else []
        if not feats:
            raise UpstreamError(f"Could not find location: {query}")
        p = feats[0]["properties"]
        lon, lat = feats[0]["geometry"]["coordinates"]
        label = ", ".join(x for x in (p.get("name"), p.get("state"), p.get("country")) if x)
        res = {"lon": lon, "lat": lat, "label": label or query}
    cache.set(key, res, 86400)
    return res


# ---------------------------------------------------------------- routing
def _ors_routes(o, d):
    body = {
        "coordinates": [[o["lon"], o["lat"]], [d["lon"], d["lat"]]],
        "alternative_routes": {"target_count": 3, "share_factor": 0.6, "weight_factor": 1.6},
        "instructions": True,
        "units": "m",
    }
    r = _session().post(
        "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson",
        json=body, headers={"Authorization": settings.ORS_API_KEY}, timeout=60,
    )
    if not r.ok:
        raise UpstreamError(f"OpenRouteService error {r.status_code}: {r.text[:200]}")
    out = []
    for f in r.json()["features"]:
        coords = f["geometry"]["coordinates"]
        segd = [0.0] * (len(coords) - 1)
        for seg in f["properties"].get("segments", []):
            for st in seg.get("steps", []):
                a, b = st["way_points"]
                if b <= a:
                    continue
                lens = [geo.haversine_mi(coords[k], coords[k + 1]) for k in range(a, b)]
                tot = sum(lens) or 1
                for k, ln in zip(range(a, b), lens):
                    segd[k] += st["duration"] * ln / tot
        s = f["properties"]["summary"]
        out.append({"coords": coords, "seg_durations": segd,
                    "distance_m": s["distance"], "duration_s": s["duration"]})
    return out, "openrouteservice (driving-hgv)"


def _osrm_call(points, alternatives):
    path = ";".join(f"{p[0]:.6f},{p[1]:.6f}" for p in points)
    r = _session().get(
        f"https://router.project-osrm.org/route/v1/driving/{path}",
        params={"alternatives": str(alternatives).lower() if isinstance(alternatives, bool) else alternatives,
                "overview": "full", "geometries": "geojson", "annotations": "duration", "steps": "false"},
        timeout=60,
    )
    if not r.ok or r.json().get("code") != "Ok":
        raise UpstreamError(f"OSRM error {r.status_code}: {r.text[:200]}")
    out = []
    for rt in r.json()["routes"]:
        segd = []
        for leg in rt["legs"]:
            segd.extend(leg.get("annotation", {}).get("duration", []))
        out.append({"coords": rt["geometry"]["coordinates"], "seg_durations": segd,
                    "distance_m": rt["distance"], "duration_s": rt["duration"]})
    return out


def _overlap(a, b):
    """Fraction of sampled points of route a that lie within ~2 mi of route b."""
    bs = b["coords"][:: max(1, len(b["coords"]) // 400)]
    pts = a["coords"][:: max(1, len(a["coords"]) // 60)]
    near = sum(1 for p in pts if min(geo.haversine_mi(p, q) for q in bs) < 2.0)
    return near / max(1, len(pts))


def _osrm_routes(o, d):
    routes = _osrm_call([(o["lon"], o["lat"]), (d["lon"], d["lat"])], 3)
    if len(routes) < 3:
        # Demo server often returns <3 alternatives: synthesise more by forcing a via point
        # offset perpendicular to the straight line at the midpoint.
        a, b = (o["lon"], o["lat"]), (d["lon"], d["lat"])
        straight = geo.haversine_mi(a, b)
        brg = geo.bearing(a, b)
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        for frac in (0.18, 0.30):
            for side in (90, -90):
                if len(routes) >= 3:
                    break
                via = geo.offset_point(mid[0], mid[1], brg + side, straight * frac)
                try:
                    cand = _osrm_call([a, via, b], False)[0]
                except UpstreamError:
                    continue
                best = routes[0]
                if cand["duration_s"] > best["duration_s"] * 1.6:
                    continue
                if all(_overlap(cand, r) < 0.8 for r in routes):
                    routes.append(cand)
    return routes[:3], "OSRM public demo (car profile; ORS_API_KEY not set)"


def get_routes(o, d):
    key = f"routes:{o['lon']:.4f},{o['lat']:.4f}:{d['lon']:.4f},{d['lat']:.4f}:{bool(settings.ORS_API_KEY)}"
    hit = cache.get(key)
    if hit:
        return hit
    if settings.ORS_API_KEY:
        try:
            res = _ors_routes(o, d)
        except (UpstreamError, requests.RequestException) as e:
            log.warning("ORS failed, falling back to OSRM: %s", e)
            res = _osrm_routes(o, d)
    else:
        res = _osrm_routes(o, d)
    cache.set(key, res, 3600)
    return res


# ---------------------------------------------------------------- weather
HOURLY = "wind_speed_10m,wind_gusts_10m,precipitation,rain,showers,snowfall"
CHUNK = 100


def _hour_floor(dt):
    return dt.replace(minute=0, second=0, microsecond=0)


def fetch_hourly(points, start: datetime, end: datetime):
    """Hourly forecast for many (lat, lon) points between start and end (UTC).

    Returns (times: list[datetime], per_point: list[dict[var -> list]]).
    Snowfall is requested in inches (precipitation_unit=inch); hourly values are per hour = in/hr.
    """
    start = _hour_floor(start.astimezone(timezone.utc))
    end = _hour_floor(end.astimezone(timezone.utc)) + timedelta(hours=1)
    sess = _session()
    results = []
    times = None
    for i in range(0, len(points), CHUNK):
        chunk = points[i:i + CHUNK]
        params = {
            "latitude": ",".join(f"{p[0]:.3f}" for p in chunk),
            "longitude": ",".join(f"{p[1]:.3f}" for p in chunk),
            "hourly": HOURLY,
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
            "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
        }
        r = sess.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=60)
        if not r.ok:
            raise UpstreamError(f"Open-Meteo error {r.status_code}: {r.text[:200]}")
        data = r.json()
        if isinstance(data, dict):
            data = [data]
        for loc in data:
            h = loc["hourly"]
            if times is None:
                times = [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in h["time"]]
            results.append(h)
    return times or [], results


def nearest_index(times, when: datetime) -> int:
    if not times:
        return -1
    t0 = times[0]
    idx = round((when - t0).total_seconds() / 3600)
    return min(max(idx, 0), len(times) - 1)


def val(series, i):
    v = series[i] if series and 0 <= i < len(series) else None
    return float(v) if v is not None else 0.0
