"""Geometry helpers: distances, polyline sampling, offsets."""
import math

EARTH_MI = 3958.7613
METERS_PER_MILE = 1609.344


def haversine_mi(a, b) -> float:
    """a, b are (lon, lat)."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_MI * math.asin(math.sqrt(h))


def cumulative(coords, seg_durations):
    """Cumulative miles and seconds at each vertex."""
    miles, secs = [0.0], [0.0]
    for i in range(1, len(coords)):
        miles.append(miles[-1] + haversine_mi(coords[i - 1], coords[i]))
        secs.append(secs[-1] + (seg_durations[i - 1] if i - 1 < len(seg_durations) else 0.0))
    return miles, secs


def sample_along(coords, cum_miles, cum_secs, interval_mi, total_duration_s=None):
    """Points every interval_mi along the line, plus the start and the destination.

    Durations are linearly interpolated within the vertex segment, then scaled so the
    last point equals the routing engine's reported total duration (if given).
    """
    total_mi = cum_miles[-1]
    targets = [0.0]
    d = interval_mi
    while d < total_mi - 1e-6:
        targets.append(d)
        d += interval_mi
    if total_mi > 0:
        targets.append(total_mi)
    scale = 1.0
    if total_duration_s and cum_secs[-1] > 0:
        scale = total_duration_s / cum_secs[-1]
    out, j = [], 0
    for t in targets:
        while j < len(cum_miles) - 2 and cum_miles[j + 1] < t:
            j += 1
        seg = cum_miles[j + 1] - cum_miles[j] if len(cum_miles) > 1 else 0
        f = 0.0 if seg <= 0 else min(max((t - cum_miles[j]) / seg, 0.0), 1.0)
        a, b = coords[j], coords[min(j + 1, len(coords) - 1)]
        lon = a[0] + (b[0] - a[0]) * f
        lat = a[1] + (b[1] - a[1]) * f
        sec = (cum_secs[j] + (cum_secs[min(j + 1, len(cum_secs) - 1)] - cum_secs[j]) * f) * scale
        out.append({"lon": lon, "lat": lat, "mile": t, "elapsed_s": sec})
    return out


def segment_miles(marks):
    """Miles represented by each checkpoint: half of the gap to each neighbour."""
    n = len(marks)
    res = []
    for i in range(n):
        lo = marks[i - 1] if i > 0 else marks[i]
        hi = marks[i + 1] if i < n - 1 else marks[i]
        res.append((marks[i] - lo) / 2 + (hi - marks[i]) / 2)
    return res


def offset_point(lon, lat, bearing_deg, dist_mi):
    br = math.radians(bearing_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    dr = dist_mi / EARTH_MI
    lat2 = math.asin(math.sin(lat1) * math.cos(dr) + math.cos(lat1) * math.sin(dr) * math.cos(br))
    lon2 = lon1 + math.atan2(math.sin(br) * math.sin(dr) * math.cos(lat1), math.cos(dr) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lon2), math.degrees(lat2)


def bearing(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    return math.degrees(math.atan2(y, x)) % 360


def simplify(coords, tol_deg: float = 0.0005):
    """Ramer-Douglas-Peucker (iterative) in lon/lat degrees; keeps endpoints. ~50 m default tolerance.

    Used only for the geometry sent to the browser; sampling/ETAs use the full-resolution line.
    """
    n = len(coords)
    if n < 3:
        return list(coords)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = coords[a][0], coords[a][1]
        bx, by = coords[b][0], coords[b][1]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = coords[i][0] - ax, coords[i][1] - ay
            if L2 == 0:
                d = px * px + py * py
            else:
                t = max(0.0, min(1.0, (px * dx + py * dy) / L2))
                ex, ey = px - t * dx, py - t * dy
                d = ex * ex + ey * ey
            if d > best:
                best, bi = d, i
        if bi != -1 and best > tol_deg * tol_deg:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [c for c, k in zip(coords, keep) if k]
