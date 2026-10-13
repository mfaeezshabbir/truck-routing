"""Pure risk-classification and recommendation logic (no I/O)."""
from dataclasses import dataclass

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = 0, 1, 2, 3, 4
LEVEL_NAMES = {LOW: "Low", MODERATE: "Moderate", HIGH: "High", SEVERE: "Severe", NO_TRAVEL: "No Travel"}


def wind_risk(mph: float) -> int:
    # Integer-mph bins in the spec (25-34, 35-44...) leave gaps for fractional values;
    # we treat each bin as [lower, next_lower).
    if mph >= 55:
        return NO_TRAVEL
    if mph >= 45:
        return SEVERE
    if mph >= 35:
        return HIGH
    if mph >= 25:
        return MODERATE
    return LOW


def rain_risk(in_hr: float) -> int:
    # Shared boundaries (0.10-0.25, 0.25-0.50) resolve upward: lower bound inclusive.
    # 1.00 is Severe; only >1.00 is No Travel (spec says ">1.00").
    if in_hr > 1.0:
        return NO_TRAVEL
    if in_hr >= 0.5:
        return SEVERE
    if in_hr >= 0.25:
        return HIGH
    if in_hr >= 0.10:
        return MODERATE
    return LOW


def snow_risk(in_hr: float) -> int:
    if in_hr > 3.0:
        return NO_TRAVEL
    if in_hr >= 2.0:
        return SEVERE
    if in_hr >= 1.0:
        return HIGH
    if in_hr >= 0.5:
        return MODERATE
    return LOW


def load_override(wind_mph: float, load_lb: float) -> int:
    """Minimum risk level imposed by the load rules (LOW if none apply)."""
    if wind_mph >= 55:
        return NO_TRAVEL
    if wind_mph >= 45 and load_lb > 30000:
        return NO_TRAVEL
    if wind_mph >= 35 and load_lb > 40000:
        return SEVERE
    return LOW


def checkpoint_risk(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> dict:
    w, r, s = wind_risk(wind_mph), rain_risk(rain_in_hr), snow_risk(snow_in_hr)
    weather = max(w, r, s)
    load = load_override(wind_mph, load_lb)
    level = max(weather, load)
    factors = []
    if w == level and level > LOW:
        factors.append("wind")
    if r == level and level > LOW:
        factors.append("rain")
    if s == level and level > LOW:
        factors.append("snow")
    if load > weather:
        factors.append("load")
    return {
        "level": level,
        "label": LEVEL_NAMES[level],
        "components": {"wind": w, "rain": r, "snow": s, "load": load},
        "factors": factors,
    }


@dataclass
class Segment:
    miles: float
    level: int


def summarize(segments: list[Segment], duration_s: float) -> dict:
    """Mileage-weighted summary: each checkpoint's risk applies to the segment it represents."""
    miles_by = {name: 0.0 for name in LEVEL_NAMES.values()}
    total = sum(s.miles for s in segments)
    weighted = 0.0
    for s in segments:
        miles_by[LEVEL_NAMES[s.level]] += s.miles
        weighted += s.level * s.miles
    avg = weighted / total if total else 0.0
    worst = max((s.level for s in segments), default=LOW)
    return {
        "miles_by_level": {k: round(v, 2) for k, v in miles_by.items()},
        "severe_miles": round(miles_by["Severe"], 2),
        "high_miles": round(miles_by["High"], 2),
        "no_travel_miles": round(miles_by["No Travel"], 2),
        "avg_risk": round(avg, 3),
        "max_level": worst,
        "max_label": LEVEL_NAMES[worst],
        "has_no_travel": worst == NO_TRAVEL,
        "duration_s": duration_s,
    }


def recommendation_key(summary: dict):
    return (
        1 if summary["has_no_travel"] else 0,
        round(summary.get("no_travel_miles", 0.0), 1),  # among blocked routes, least blocked distance first
        round(summary["severe_miles"], 1),
        round(summary["high_miles"], 1),
        round(summary["avg_risk"], 3),
        summary["duration_s"],
    )


def _fmt_duration(s: float) -> str:
    m = round(s / 60)
    return f"{m // 60}h {m % 60:02d}m"


# One entry per element of recommendation_key: (criterion label, formatter of the summary value).
_CRITERIA = [
    ("No Travel conditions", lambda s: "yes" if s["has_no_travel"] else "none"),
    ("No Travel miles", lambda s: f"{s.get('no_travel_miles', 0.0):.0f} mi"),
    ("Severe miles", lambda s: f"{s['severe_miles']:.0f} mi"),
    ("High miles", lambda s: f"{s['high_miles']:.0f} mi"),
    ("average risk", lambda s: f"{s['avg_risk']:.3f}"),
    ("travel time", lambda s: _fmt_duration(s["duration_s"])),
]


def deciding_criterion(a: dict, b: dict):
    """First ranking criterion on which summaries a and b differ: (label, a_value, b_value), or None if tied."""
    for (label, fmt), ka, kb in zip(_CRITERIA, recommendation_key(a), recommendation_key(b)):
        if ka != kb:
            return label, fmt(a), fmt(b)
    return None


def rank_routes(summaries: list[dict]) -> list[int]:
    """Return indices of summaries ordered best-first."""
    return sorted(range(len(summaries)), key=lambda i: recommendation_key(summaries[i]))
