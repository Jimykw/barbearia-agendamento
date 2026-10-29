from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Perfil Personalizado", {"fields": ("role", "phone", "avatar")}),
    )
    list_display = ("username", "email", "get_full_name", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active", "created_at")
    search_fields = ("username", "email", "first_name", "last_name", "phone")
    ordering = ("-created_at",)
