from datetime import timezone

from rest_framework import serializers


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=0, max_value=200000)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate(self, attrs):
        if attrs["origin"].strip().lower() == attrs["destination"].strip().lower():
            raise serializers.ValidationError({"destination": "Origin and destination must differ."})
        return attrs

    def validate_departure(self, v):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)
