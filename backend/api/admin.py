from django.contrib import admin

from .models import Appointment, PortfolioSiteConfig


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone", "service", "barber", "date", "time", "status")
    list_filter = ("service", "barber", "status", "date")
    search_fields = ("name", "email", "phone")


@admin.register(PortfolioSiteConfig)
class PortfolioSiteConfigAdmin(admin.ModelAdmin):
    list_display = ("id", "updated_at")
