"""Hours-of-service timing (pure, no I/O).

Simplified FMCSA property-carrying rules for a solo driver who starts the trip fresh:
* a 30-minute break after 8 hours of driving,
* a 10-hour off-duty rest after 11 hours of driving (which also resets the 8-hour break clock).
The 14-hour window is never hit (11 h driving + 0.5 h break), and the 60/70-hour weekly limit is ignored.
"""

BREAK_AFTER_S = 8 * 3600
BREAK_S = 30 * 60
DRIVE_LIMIT_S = 11 * 3600
REST_S = 10 * 3600


def plan_stops(drive_s: float) -> list[dict]:
    """Mandatory stops for a trip of drive_s seconds of driving, as {kind, drive_s, duration_s}.

    drive_s of a stop is the driving time already done when it starts; a stop that would fall exactly at
    the destination is not needed.
    """
    stops = []
    shift = 0.0
    while True:
        brk = shift + BREAK_AFTER_S
        if brk >= drive_s:
            break
        stops.append({"kind": "break", "drive_s": brk, "duration_s": BREAK_S})
        rest = shift + DRIVE_LIMIT_S
        if rest >= drive_s:
            break
        stops.append({"kind": "rest", "drive_s": rest, "duration_s": REST_S})
        shift = rest
    return stops


def wall_elapsed(drive_s: float, stops: list[dict]) -> float:
    """Clock time from departure until drive_s seconds of driving are done (stops started before it count)."""
    return drive_s + sum(s["duration_s"] for s in stops if s["drive_s"] < drive_s)
