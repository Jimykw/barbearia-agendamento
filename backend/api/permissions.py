from rest_framework import permissions


class IsAppointmentStaffOrOwnerOrAdmin(permissions.BasePermission):
    """Admin, cliente dono do agendamento ou barbeiro atribuído (calendar_key)."""

    @staticmethod
    def _barber_matches(user, obj):
        from barbers.models import Barber

        try:
            barber = Barber.objects.only("calendar_key").get(user=user)
        except Barber.DoesNotExist:
            return False
        key = (barber.calendar_key or "").strip()
        return bool(key) and obj.barber == key

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        role = getattr(user, "role", None)
        if role == "admin":
            return True

        is_owner = obj.customer_id and obj.customer_id == user.id

        if request.method == "DELETE":
            return bool(is_owner)

        if request.method in permissions.SAFE_METHODS:
            if is_owner:
                return True
            if role == "barbeiro":
                return self._barber_matches(user, obj)
            return False

        if is_owner:
            return True
        if role == "barbeiro":
            return self._barber_matches(user, obj)
        return False


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_authenticated and request.user.role == "admin"


class IsOwnerOrAdmin(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_authenticated and (
            obj.customer == request.user or request.user.role == "admin"
        )


class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) == "admin")
