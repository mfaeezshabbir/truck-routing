import pytest

from routing import hos

H = 3600


def test_short_trip_has_no_stops():
    assert hos.plan_stops(8 * H) == []  # arriving exactly at 8 h needs no break
    assert hos.wall_elapsed(5 * H, []) == 5 * H


def test_break_then_rest_then_next_shift():
    stops = hos.plan_stops(25 * H)
    assert [(s["kind"], s["drive_s"] / H) for s in stops] == [
        ("break", 8), ("rest", 11), ("break", 19), ("rest", 22)]


def test_wall_elapsed_adds_only_stops_already_started():
    stops = hos.plan_stops(15 * H)  # break at 8 h, rest at 11 h
    assert hos.wall_elapsed(8 * H, stops) == 8 * H  # reaching the break point: break not taken yet
    assert hos.wall_elapsed(9 * H, stops) == 9.5 * H
    assert hos.wall_elapsed(12 * H, stops) == pytest.approx(12 * H + 0.5 * H + 10 * H)
    assert hos.wall_elapsed(15 * H, stops) == pytest.approx(25.5 * H)
