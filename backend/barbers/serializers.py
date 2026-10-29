from rest_framework import serializers
from .models import Barber, BarberAvailability


class BarberAvailabilitySerializer(serializers.ModelSerializer):
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = BarberAvailability
        fields = ["id", "day_of_week", "day_name", "start_time", "end_time", "is_available"]


class BarberSerializer(serializers.ModelSerializer):
    user_data = serializers.SerializerMethodField()
    availability = BarberAvailabilitySerializer(many=True, read_only=True)

    class Meta:
        model = Barber
        fields = [
            "id",
            "calendar_key",
            "user_data",
            "bio",
            "specialties",
            "rating",
            "total_appointments",
            "is_available",
            "hired_at",
            "availability",
        ]

    def get_user_data(self, obj):
        return {
            "id": obj.user.id,
            "name": obj.user.get_full_name() or obj.user.username,
            "email": obj.user.email,
            "phone": obj.user.phone,
            "avatar": obj.user.avatar.url if obj.user.avatar else None,
        }