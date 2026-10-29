from rest_framework import serializers
from .models import Contact, ContactMessage


class ContactSerializer(serializers.ModelSerializer):
    contact_type_display = serializers.CharField(source="get_contact_type_display", read_only=True)

    class Meta:
        model = Contact
        fields = ["id", "contact_type", "contact_type_display", "value", "label", "is_public", "is_primary"]
        read_only_fields = ["id"]


class ContactMessageSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "subject",
            "message",
            "status",
            "status_display",
            "created_at",
        ]
        read_only_fields = ["id", "status", "created_at"]