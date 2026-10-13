from datetime import datetime, timedelta, timezone

import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import planner, services
from .serializers import PlanRequestSerializer

def _not_found():
    return Response({"error": "Unknown or expired plan_id"}, status=status.HTTP_404_NOT_FOUND)


def _call(fn, *args):
    """Run a planner step and turn its errors into API responses."""
    try:
        return Response(fn(*args))
    except services.InputError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except services.UpstreamError as e:
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
    except requests.RequestException as e:
        return Response({"error": f"Upstream request failed: {e}"}, status=status.HTTP_502_BAD_GATEWAY)


def _trip_args(request):
    ser = PlanRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    v = ser.validated_data
    now = datetime.now(timezone.utc)
    if v["departure"] < now - timedelta(hours=1) or v["departure"] > now + timedelta(days=13):
        raise services.InputError("Departure must be between now and 13 days ahead (forecast horizon).")
    return v["origin"], v["destination"], v["departure"], v["load_lb"], int(v["interval_mi"])


@api_view(["GET"])
def health(request):
    return Response({"ok": True})


@api_view(["POST"])
def plan(request):
    """One step: the server fetches the weather itself."""
    return _call(lambda: planner.plan_trip(*_trip_args(request)))


@api_view(["POST"])
def plan_prepare(request):
    """Step 1 of 2: routes and ETAs, plus the forecast query for the client to run."""
    return _call(lambda: planner.weather_request(planner.prepare_trip(*_trip_args(request))))


@api_view(["POST"])
def plan_score(request):
    """Step 2 of 2: the client sends the forecast back; returns the same result as /api/plan."""
    state = planner.load_prepared(str(request.data.get("plan_id", "")))
    if state is None:
        return _not_found()

    def score():
        times, hourly = services.parse_client_weather(request.data.get("weather"), len(state["points"]))
        return planner.score_trip(state, times, hourly)
    return _call(score)


@api_view(["GET", "POST"])
def heatmap(request):
    """GET: the server fetches the weather. POST {plan_id, weather}: uses client-fetched weather."""
    if request.method == "POST":
        plan_id, weather = str(request.data.get("plan_id", "")), request.data.get("weather")
    else:
        plan_id, weather = request.query_params.get("plan_id", ""), None
    resp = _call(planner.heatmap, plan_id, weather)
    return _not_found() if resp.data is None else resp


@api_view(["GET"])
def heatmap_request(request):
    """The forecast query the client should run for a plan's heatmap."""
    resp = _call(planner.heatmap_request, request.query_params.get("plan_id", ""))
    return _not_found() if resp.data is None else resp
