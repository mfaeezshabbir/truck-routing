"""End-to-end tests of /api/plan and /api/heatmap with the external services mocked."""
from datetime import datetime, timedelta, timezone

import pytest
from rest_framework.test import APIClient

from routing import geo, risk, services

NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
PLACES = {"a": {"lon": -97.0, "lat": 32.0, "label": "A"}, "b": {"lon": -97.0, "lat": 33.0, "label": "B"},
          "a2": {"lon": -97.0001, "lat": 32.0001, "label": "A again"}}


def fake_hourly(wind=5.0, rain=0.0, snow_in=0.0):
    def fetch(points, start, end):
        start = start.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
        n = int((end - start).total_seconds() // 3600) + 2
        times = [start + timedelta(hours=h) for h in range(n)]
        # wind encodes the hour index so tests can see which forecast hour was picked
        per = [{"wind_speed_10m": [wind + h * 0.0 for h in range(n)], "wind_gusts_10m": [0] * n,
                "precipitation": [rain] * n, "rain": [rain] * n, "showers": [0] * n,
                "snowfall": [snow_in] * n, "_hours": list(range(n))} for _ in points]
        return times, per
    return fetch


@pytest.fixture
def client(monkeypatch):
    def geocode(q):
        if q.lower() not in PLACES:
            raise services.InputError(f"Could not find location: {q}")
        return PLACES[q.lower()]

    def routes(o, d):
        coords = [[o["lon"], o["lat"] + i * (d["lat"] - o["lat"]) / 100] for i in range(101)]
        dur = 3600 * 2.0
        return [{"coords": coords, "seg_durations": [dur / 100] * 100, "distance_m": 69.1 * geo.METERS_PER_MILE,
                 "duration_s": dur}], "fake"

    monkeypatch.setattr(services, "geocode", geocode)
    monkeypatch.setattr(services, "get_routes", routes)
    monkeypatch.setattr(services, "fetch_hourly", fake_hourly())
    return APIClient()


def body(**kw):
    b = {"origin": "a", "destination": "b", "departure": (NOW + timedelta(hours=2, minutes=40)).isoformat(),
         "load_lb": 35000, "interval_mi": 10}
    b.update(kw)
    return b


@pytest.mark.django_db
def test_plan_ok_eta_and_forecast_hour(client):
    r = client.post("/api/plan", body(), format="json")
    assert r.status_code == 200, r.data
    cps = r.data["routes"][0]["checkpoints"]
    assert [c["mile"] for c in cps[:3]] == [0.0, 10.0, 20.0]
    dep = datetime.fromisoformat(r.data["departure"])
    for c in cps:
        eta = datetime.fromisoformat(c["eta"])
        fh = datetime.fromisoformat(c["forecast_hour"])
        assert eta >= dep
        assert abs((fh - eta).total_seconds()) <= 1800  # nearest forecast hour
    assert r.data["recommended_route_id"] == 0


@pytest.mark.django_db
@pytest.mark.parametrize("interval", [10, 25, 50])
def test_checkpoint_spacing(client, interval):
    r = client.post("/api/plan", body(interval_mi=interval), format="json")
    marks = [c["mile"] for c in r.data["routes"][0]["checkpoints"]]
    assert all(abs((b - a) - interval) < 0.05 for a, b in zip(marks[:-2], marks[1:-1]))
    assert sum(c["segment_miles"] for c in r.data["routes"][0]["checkpoints"]) == pytest.approx(marks[-1], abs=0.1)


@pytest.mark.django_db
def test_naive_departure_is_utc(client):
    naive = (NOW + timedelta(hours=3)).replace(tzinfo=None).isoformat()
    r = client.post("/api/plan", body(departure=naive), format="json")
    assert r.status_code == 200
    assert r.data["departure"].endswith("+00:00")


@pytest.mark.django_db
@pytest.mark.parametrize("kw,frag", [
    ({"origin": "nowhere"}, "Could not find"),
    ({"destination": "a"}, "differ"),
    ({"destination": "a2"}, "same place"),
    ({"departure": "2020-01-01T00:00:00Z"}, "Departure"),
    ({"load_lb": -1}, "load_lb"),
    ({"load_lb": 10**9}, "load_lb"),
    ({"interval_mi": 30}, "interval_mi"),
])
def test_bad_input_is_400(client, kw, frag):
    r = client.post("/api/plan", body(**kw), format="json")
    assert r.status_code == 400
    assert frag in str(r.data)


@pytest.mark.django_db
def test_trip_beyond_forecast_horizon(client, monkeypatch):
    monkeypatch.setattr(services, "forecast_horizon", lambda now=None: NOW + timedelta(hours=3))
    r = client.post("/api/plan", body(), format="json")
    assert r.status_code == 400 and "forecast horizon" in r.data["error"]


def test_forecast_horizon_value():
    h = services.forecast_horizon(datetime(2026, 10, 12, 23, 43, tzinfo=timezone.utc))
    assert h == datetime(2026, 10, 27, 23, 0, tzinfo=timezone.utc)


@pytest.mark.django_db
def test_heatmap_hours_align_with_forecast_and_truncate(client, monkeypatch):
    r = client.post("/api/plan", body(), format="json")
    pid = r.data["plan_id"]
    h = client.get(f"/api/heatmap?plan_id={pid}").data
    assert len(h["hours"]) == 49
    first = datetime.fromisoformat(h["hours"][0])
    dep = datetime.fromisoformat(h["departure"])
    assert first.minute == 0 and abs((first - dep).total_seconds()) <= 1800
    assert all(len(row) == len(h["points"]) for row in h["risk"])
    # forecast ends 10 h after departure -> slider gets only real hours, no repeated last hour
    real = services.fetch_hourly

    def short(points, start, end):
        t, p = real(points, start, end)
        return t[:11], p
    monkeypatch.setattr(services, "fetch_hourly", short)
    h2 = client.get(f"/api/heatmap?plan_id={pid}").data
    assert len(h2["hours"]) == 11 - 0 - (1 if dep.minute >= 30 else 0)
    assert len(set(h2["hours"])) == len(h2["hours"])
    assert client.get("/api/heatmap?plan_id=nope").status_code == 404


@pytest.mark.django_db
def test_no_travel_wind_blocks_recommendation(client, monkeypatch):
    monkeypatch.setattr(services, "fetch_hourly", fake_hourly(wind=56))
    r = client.post("/api/plan", body(), format="json")
    assert r.data["recommended_route_id"] is None and r.data["warning"]
    assert r.data["routes"][0]["recommended"] is False


@pytest.mark.django_db
def test_snow_inches_used_directly(client, monkeypatch):
    # fetch_hourly requests precipitation_unit=inch, so snowfall is already in/hr
    monkeypatch.setattr(services, "fetch_hourly", fake_hourly(snow_in=1.2))
    r = client.post("/api/plan", body(), format="json")
    assert r.data["routes"][0]["checkpoints"][1]["risk"]["label"] == "High"


def test_rank_among_no_travel_routes_prefers_fewer_blocked_miles():
    def s(nt, sev):
        return {"has_no_travel": nt > 0, "no_travel_miles": nt, "severe_miles": sev, "high_miles": 0,
                "avg_risk": 1, "duration_s": 100}
    assert risk.rank_routes([s(50, 0), s(10, 30), s(0, 100)]) == [2, 1, 0]


def test_simplify_keeps_shape_and_endpoints():
    line = [[i * 0.001, 0.0] for i in range(1000)] + [[1.0, 0.5]]
    out = geo.simplify(line)
    assert out[0] == line[0] and out[-1] == line[-1] and [0.999, 0.0] in out
    assert len(out) <= 4


def test_open_meteo_retries_transient_errors(monkeypatch):
    calls = []

    class R:
        def __init__(self, code):
            self.status_code, self.ok, self.text = code, code == 200, ""

        def json(self):
            return {"hourly": {"time": ["2026-10-13T00:00"], "wind_speed_10m": [1]}}

    class S:
        def get(self, *a, **k):
            calls.append(1)
            return R(503 if len(calls) < 3 else 200)

    monkeypatch.setattr(services, "_session", lambda: S())
    monkeypatch.setattr(services.time, "sleep", lambda s: None)
    t, p = services.fetch_hourly([(40, -100)], datetime.now(timezone.utc), datetime.now(timezone.utc))
    assert len(calls) == 3 and len(t) == 1
