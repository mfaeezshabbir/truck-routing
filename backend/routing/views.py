from datetime import datetime, timedelta, timezone

import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import planner, services
from .serializers import PlanRequestSerializer


@api_view(["GET"])
def health(request):
    return Response({"ok": True})


@api_view(["POST"])
def plan(request):
    ser = PlanRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    v = ser.validated_data
    now = datetime.now(timezone.utc)
    if v["departure"] < now - timedelta(hours=1) or v["departure"] > now + timedelta(days=13):
        return Response({"error": "Departure must be between now and 13 days ahead (forecast horizon)."},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        data = planner.plan_trip(v["origin"], v["destination"], v["departure"], v["load_lb"], int(v["interval_mi"]))
    except services.UpstreamError as e:
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
    except requests.RequestException as e:
        return Response({"error": f"Upstream request failed: {e}"}, status=status.HTTP_502_BAD_GATEWAY)
    return Response(data)


@api_view(["GET"])
def heatmap(request):
    plan_id = request.query_params.get("plan_id", "")
    try:
        data = planner.heatmap(plan_id)
    except (services.UpstreamError, requests.RequestException) as e:
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
    if data is None:
        return Response({"error": "Unknown or expired plan_id"}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)
