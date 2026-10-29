from django.contrib import admin
from .models import Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "duration_minutes", "is_active", "created_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("name", "description")
    fieldsets = (
        ("Informações Básicas", {"fields": ("name", "description")}),
        ("Detalhes", {"fields": ("duration_minutes", "price", "is_active")}),
    )
    ordering = ("name",)
