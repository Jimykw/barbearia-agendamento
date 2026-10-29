from rest_framework import generics, mixins, permissions, viewsets

from api.permissions import IsAdminRole

from .models import Contact, ContactMessage
from .serializers import ContactSerializer, ContactMessageSerializer


class ContactViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Contact.objects.filter(is_public=True)
    serializer_class = ContactSerializer
    permission_classes = [permissions.AllowAny]


class ContactMessageViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageSerializer
    filterset_fields = ["status"]
    search_fields = ["name", "email", "subject"]
    throttle_scope = "contact"

    def get_permissions(self):
        if self.action == "create":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsAdminRole()]

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and getattr(user, "role", None) == "admin":
            return ContactMessage.objects.all()
        return ContactMessage.objects.none()
