from decimal import Decimal

from rest_framework import serializers

from api.models import Appointment
from barbers.models import Barber

from .appointment_payments import SERVICE_PRICES
from .models import (
    AppointmentCost,
    NotificationEvent,
    PaymentTransaction,
    SaaSPlan,
    ServiceUsageCost,
    SiteSubscription,
    UsageTracking,
    UserBilling,
)


class UsageTrackingSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    
    class Meta:
        model = UsageTracking
        fields = ["id", "action", "action_display", "created_at", "metadata"]
        read_only_fields = ["id", "created_at"]


class ServiceUsageCostSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    
    class Meta:
        model = ServiceUsageCost
        fields = ["id", "action", "action_display", "cost_per_action", "description", "is_active"]


class UserBillingSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    
    class Meta:
        model = UserBilling
        fields = ["id", "user", "month", "total_cost", "status", "status_display", "due_date", "paid_at", "usage_details"]
        read_only_fields = ["id", "created_at", "updated_at", "usage_details"]


class AppointmentCostSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppointmentCost
        fields = ["id", "appointment", "service_price", "platform_fee", "discount_applied", "total_cost"]
        read_only_fields = ["id"]


class PaymentTransactionSerializer(serializers.ModelSerializer):
    provider_display = serializers.CharField(source="get_provider_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    appointment_summary = serializers.SerializerMethodField()

    class Meta:
        model = PaymentTransaction
        fields = [
            "id",
            "appointment",
            "appointment_summary",
            "provider",
            "provider_display",
            "preference_id",
            "payment_id",
            "checkout_url",
            "amount",
            "status",
            "status_display",
            "raw_payload",
            "created_at",
            "updated_at",
        ]

    @staticmethod
    def _barber_display_name(calendar_key: str) -> str:
        key = (calendar_key or "").strip()
        if not key:
            return "—"
        row = Barber.objects.select_related("user").filter(calendar_key=key).first()
        if row and row.user_id:
            return (row.user.get_full_name() or row.user.username or key).strip()
        for value, label in Appointment.BARBER_CHOICES:
            if value == key:
                return str(label)
        return key.replace("_", " ").strip().title() or "—"

    def get_appointment_summary(self, obj):
        appointment = getattr(obj, "appointment", None)
        if not appointment:
            return None
        barber_key = (appointment.barber or "").strip()
        barber_map = (self.context or {}).get("barber_display_map") or {}
        barber_display = barber_map.get(barber_key) if barber_map else None
        if not barber_display:
            barber_display = self._barber_display_name(barber_key)
        list_price = SERVICE_PRICES.get(appointment.service, Decimal("50.00"))
        return {
            "id": appointment.id,
            "name": appointment.name,
            "service": appointment.service,
            "barber": appointment.barber,
            "barber_display": barber_display,
            "service_list_price": str(list_price),
            "date": appointment.date,
            "time": appointment.time,
            "status": appointment.status,
        }


class NotificationEventSerializer(serializers.ModelSerializer):
    channel_display = serializers.CharField(source="get_channel_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    appointment_summary = serializers.SerializerMethodField()

    class Meta:
        model = NotificationEvent
        fields = [
            "id",
            "appointment",
            "appointment_summary",
            "channel",
            "channel_display",
            "event_type",
            "recipient",
            "message",
            "status",
            "status_display",
            "provider_response",
            "created_at",
        ]

    def get_appointment_summary(self, obj):
        appointment = getattr(obj, "appointment", None)
        if not appointment:
            return None
        return {
            "id": appointment.id,
            "name": appointment.name,
            "service": appointment.service,
            "barber": appointment.barber,
            "date": appointment.date,
            "time": appointment.time,
            "status": appointment.status,
        }


class SaaSPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaaSPlan
        fields = [
            "id",
            "slug",
            "name",
            "monthly_price",
            "yearly_price",
            "max_barbers",
            "max_monthly_appointments",
            "features",
            "is_active",
        ]


class SiteSubscriptionSerializer(serializers.ModelSerializer):
    plan = SaaSPlanSerializer(read_only=True)
    plan_id = serializers.IntegerField(write_only=True, required=False)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    billing_cycle_display = serializers.CharField(source="get_billing_cycle_display", read_only=True)

    class Meta:
        model = SiteSubscription
        fields = [
            "id",
            "plan",
            "plan_id",
            "status",
            "status_display",
            "billing_cycle",
            "billing_cycle_display",
            "started_at",
            "trial_ends_at",
            "current_period_end",
            "last_payment_at",
            "grace_days",
            "auto_renew",
        ]

    def update(self, instance, validated_data):
        plan_id = validated_data.pop("plan_id", None)
        if plan_id is not None:
            instance.plan = SaaSPlan.objects.filter(pk=plan_id, is_active=True).first()
        return super().update(instance, validated_data)
