from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import viewsets, permissions
from .models import Barber
from .serializers import BarberSerializer

User = get_user_model()


class BarberViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Barber.objects.all()
    serializer_class = BarberSerializer
    permission_classes = [permissions.AllowAny]
    filterset_fields = ["is_available", "rating"]
    search_fields = ["user__first_name", "user__last_name", "specialties"]

    @staticmethod
    def _ensure_calendar_key(user):
        raw_base = user.get_full_name() or user.username or f"barbeiro-{user.id}"
        base = slugify(raw_base).replace("-", "_") or f"barbeiro_{user.id}"
        key = base
        suffix = 2
        while Barber.objects.exclude(user=user).filter(calendar_key=key).exists():
            key = f"{base}_{suffix}"
            suffix += 1
        return key

    def get_queryset(self):
        # Auto-recupera barbeiros que receberam cargo, mas ainda não tinham perfil criado.
        role_barbers = User.objects.filter(role=User.ROLE_BARBEIRO)
        existing_ids = set(Barber.objects.filter(user__in=role_barbers).values_list("user_id", flat=True))
        to_create = [user for user in role_barbers if user.id not in existing_ids]
        for user in to_create:
            Barber.objects.create(
                user=user,
                calendar_key=self._ensure_calendar_key(user),
                is_available=True,
                hired_at=timezone.now(),
            )

        return (
            Barber.objects.filter(is_available=True, user__role=User.ROLE_BARBEIRO)
            .exclude(calendar_key="")
            .select_related("user")
            .order_by("calendar_key")
        )
