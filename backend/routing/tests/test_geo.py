import pytest

from routing import geo


def test_sample_along_interval_and_eta():
    coords = [(0, 0), (0, 1), (0, 2)]  # ~69 mi per degree latitude
    cm, cs = geo.cumulative(coords, [3600, 3600])
    pts = geo.sample_along(coords, cm, cs, 25, total_duration_s=7200)
    assert [round(p["mile"]) for p in pts] == [0, 25, 50, 75, 100, 125, 138]
    assert pts[0]["elapsed_s"] == 0
    assert pts[-1]["elapsed_s"] == pytest.approx(7200)
    assert pts[1]["elapsed_s"] == pytest.approx(7200 * 25 / cm[-1], rel=1e-3)


def test_segment_miles_sum_to_total():
    marks = [0, 25, 50, 60]
    assert sum(geo.segment_miles(marks)) == pytest.approx(60)
