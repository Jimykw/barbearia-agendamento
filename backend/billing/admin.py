from django.contrib import admin
from .models import UsageTracking, ServiceUsageCost, UserBilling, AppointmentCost


@admin.register(UsageTracking)
class UsageTrackingAdmin(admin.ModelAdmin):
    list_display = ["user", "action", "created_at"]
    list_filter = ["action", "created_at"]
    search_fields = ["user__username", "user__email"]
    readonly_fields = ["created_at"]


@admin.register(ServiceUsageCost)
class ServiceUsageCostAdmin(admin.ModelAdmin):
    list_display = ["action", "cost_per_action", "is_active", "updated_at"]
    list_filter = ["is_active", "updated_at"]
    list_editable = ["cost_per_action", "is_active"]


@admin.register(UserBilling)
class UserBillingAdmin(admin.ModelAdmin):
    list_display = ["user", "month", "total_cost", "status", "due_date"]
    list_filter = ["status", "month"]
    search_fields = ["user__username", "user__email"]
    readonly_fields = ["created_at", "updated_at", "usage_details"]


@admin.register(AppointmentCost)
class AppointmentCostAdmin(admin.ModelAdmin):
    list_display = ["appointment", "service_price", "platform_fee", "total_cost"]
    list_filter = ["created_at"]
    readonly_fields = ["created_at"]
