from django.contrib import admin
from .models import Barber, BarberAvailability


class BarberAvailabilityInline(admin.TabularInline):
    model = BarberAvailability
    extra = 1


@admin.register(Barber)
class BarberAdmin(admin.ModelAdmin):
    list_display = ("user", "rating", "total_appointments", "is_available", "created_at")
    list_filter = ("is_available", "created_at", "rating")
    search_fields = ("user__first_name", "user__last_name", "user__email", "specialties")
    fieldsets = (
        ("Usuário", {"fields": ("user",)}),
        ("Informações", {"fields": ("bio", "specialties")}),
        ("Desempenho", {"fields": ("rating", "total_appointments")}),
        ("Status", {"fields": ("is_available",)}),
    )
    inlines = [BarberAvailabilityInline]
    readonly_fields = ("created_at", "updated_at", "rating", "total_appointments")
