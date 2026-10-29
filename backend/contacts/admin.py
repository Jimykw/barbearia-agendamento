from django.contrib import admin
from .models import Contact, ContactMessage


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("contact_type", "value", "label", "is_public", "is_primary")
    list_filter = ("contact_type", "is_public", "is_primary")
    fieldsets = (
        ("Contato", {"fields": ("contact_type", "value")}),
        ("Opções", {"fields": ("label", "is_public", "is_primary")}),
    )


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "status", "created_at", "read_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "email", "subject", "message")
    fieldsets = (
        ("Remetente", {"fields": ("name", "email", "phone")}),
        ("Mensagem", {"fields": ("subject", "message")}),
        ("Resposta", {"fields": ("response", "status")}),
    )
    readonly_fields = ("created_at", "read_at", "answered_at")
    ordering = ("-created_at",)
