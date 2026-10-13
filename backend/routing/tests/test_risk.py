import pytest

from routing import risk
from routing.risk import HIGH, LOW, MODERATE, NO_TRAVEL, SEVERE, Segment


@pytest.mark.parametrize("mph,exp", [(0, LOW), (24.9, LOW), (25, MODERATE), (34.9, MODERATE), (35, HIGH),
                                     (44.9, HIGH), (45, SEVERE), (54.9, SEVERE), (55, NO_TRAVEL), (80, NO_TRAVEL)])
def test_wind(mph, exp):
    assert risk.wind_risk(mph) == exp


@pytest.mark.parametrize("v,exp", [(0, LOW), (0.099, LOW), (0.10, MODERATE), (0.249, MODERATE), (0.25, HIGH),
                                   (0.49, HIGH), (0.50, SEVERE), (1.00, SEVERE), (1.01, NO_TRAVEL)])
def test_rain(v, exp):
    assert risk.rain_risk(v) == exp


@pytest.mark.parametrize("v,exp", [(0, LOW), (0.49, LOW), (0.5, MODERATE), (0.99, MODERATE), (1.0, HIGH),
                                   (1.99, HIGH), (2.0, SEVERE), (3.0, SEVERE), (3.01, NO_TRAVEL)])
def test_snow(v, exp):
    assert risk.snow_risk(v) == exp


@pytest.mark.parametrize("wind,load,exp", [
    (55, 1000, NO_TRAVEL), (60, 0, NO_TRAVEL),
    (45, 30001, NO_TRAVEL), (54, 45000, NO_TRAVEL), (45, 30000, LOW), (50, 20000, LOW),
    (35, 40001, SEVERE), (44, 80000, SEVERE), (35, 40000, LOW), (34, 80000, LOW),
])
def test_load_override(wind, load, exp):
    assert risk.load_override(wind, load) == exp


def test_checkpoint_worst_condition():
    r = risk.checkpoint_risk(10, 0.3, 0.6, 10000)
    assert r["level"] == HIGH and r["factors"] == ["rain"]


def test_checkpoint_load_escalates():
    # 40 mph wind is High by weather; >40k lb escalates to Severe
    assert risk.checkpoint_risk(40, 0, 0, 45000)["level"] == SEVERE
    assert "load" in risk.checkpoint_risk(40, 0, 0, 45000)["factors"]
    assert risk.checkpoint_risk(40, 0, 0, 35000)["level"] == HIGH
    # 48 mph Severe -> No Travel when >30k
    assert risk.checkpoint_risk(48, 0, 0, 35000)["level"] == NO_TRAVEL
    assert risk.checkpoint_risk(48, 0, 0, 25000)["level"] == SEVERE


def test_load_never_lowers():
    assert risk.checkpoint_risk(36, 2.0, 0, 50000)["level"] == NO_TRAVEL


def test_summary_mileage_weighted():
    s = risk.summarize([Segment(10, LOW), Segment(30, HIGH), Segment(10, SEVERE)], 3600)
    assert s["high_miles"] == 30 and s["severe_miles"] == 10
    assert s["avg_risk"] == pytest.approx((0 + 60 + 30) / 50)
    assert s["max_label"] == "Severe" and not s["has_no_travel"]


def _s(severe=0, high=0, avg=0.0, dur=100, nt=False):
    return {"severe_miles": severe, "high_miles": high, "avg_risk": avg, "duration_s": dur, "has_no_travel": nt}


def test_rank_severe_first():
    assert risk.rank_routes([_s(severe=10, dur=10), _s(severe=0, high=100, dur=999)]) == [1, 0]


def test_rank_high_then_avg_then_time():
    assert risk.rank_routes([_s(high=20), _s(high=5)]) == [1, 0]
    assert risk.rank_routes([_s(avg=0.5), _s(avg=0.2)]) == [1, 0]
    assert risk.rank_routes([_s(dur=500), _s(dur=300), _s(dur=400)]) == [1, 2, 0]


def test_rank_no_travel_last():
    assert risk.rank_routes([_s(nt=True), _s(severe=50, high=50, avg=2.5, dur=9999)]) == [1, 0]


def _sum(severe=0.0, high=0.0, avg=0.5, dur=3600, nt=0.0):
    return {"has_no_travel": nt > 0, "no_travel_miles": nt, "severe_miles": severe, "high_miles": high,
            "avg_risk": avg, "duration_s": dur}


def test_deciding_criterion_names_first_difference():
    assert risk.deciding_criterion(_sum(severe=0, high=50), _sum(severe=38)) == ("Severe miles", "0 mi", "38 mi")
    assert risk.deciding_criterion(_sum(dur=7200), _sum(dur=3600))[0] == "travel time"
    assert risk.deciding_criterion(_sum(), _sum()) is None
