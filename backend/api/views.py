import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils import timezone
from django.utils.text import slugify
from django.db.models import Q
from django.core.files.storage import default_storage
import uuid

from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from barbers.models import Barber

from services.models import Service

from .models import (
    Appointment,
    BlockTemplate,
    BlockedSlot,
    BusinessHours,
    ClientPackage,
    ClientPackageSubscription,
    PortfolioSiteConfig,
)
from .permissions import IsAdminRole, IsAppointmentStaffOrOwnerOrAdmin
from .serializers import (
    AdminUserSerializer,
    apply_sessions_depleted_on_last_consume,
    AppointmentSerializer,
    BlockTemplateSerializer,
    BlockedSlotSerializer,
    BusinessHoursSerializer,
    ClientPackageSerializer,
    ClientPackageSubscriptionSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PortfolioSiteConfigWriteSerializer,
    RegisterSerializer,
    EmailOrUsernameTokenObtainPairSerializer,
    UserSerializer,
)
from .services import create_appointment
from .booking_slots import appointment_duration_minutes, aware_blocking_intervals, aware_slot_overlaps_intervals
from billing.utils import subscription_allows_bookings
from billing.models import SaaSPlan
from .notifications import send_profile_email, send_whatsapp_text
from .package_subscriptions import expire_outdated_client_package_subscriptions

User = get_user_model()

logger = logging.getLogger("api.auth")


def _auth_timing_enabled() -> bool:
    return bool(getattr(settings, "AUTH_TIMING_DEBUG", False))


class ApiHealthView(APIView):
    """
    Ping leve para cold start (Render) e monitorização.
    Inclui estado da base de dados para diagnóstico em produção.
    """

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        db_ok = False
        try:
            from django.db import connection

            connection.ensure_connection()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_ok = True
        except Exception:
            logger.exception("Health check: falha na ligação à base de dados")

        return Response({"ok": True, "db": db_ok})


class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    """
    Login JWT com e-mail ou username.
    Inclui o objecto `user` (mesmo formato que GET /api/auth/user/) para o cliente
    evitar um segundo pedido HTTP após o login.
    """

    serializer_class = EmailOrUsernameTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        t0 = time.perf_counter()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        t1 = time.perf_counter()
        payload = dict(serializer.validated_data)
        payload["user"] = UserSerializer(serializer.user).data
        t2 = time.perf_counter()
        if _auth_timing_enabled():
            logger.info(
                "[auth_timing] login POST total_ms=%.0f validate_ms=%.0f user_serialize_ms=%.0f user_id=%s",
                (t2 - t0) * 1000,
                (t1 - t0) * 1000,
                (t2 - t1) * 1000,
                getattr(serializer.user, "pk", None),
            )
        return Response(payload, status=status.HTTP_200_OK)


class DemoStatusView(APIView):
    """Indica ao frontend se a interface deve mostrar os atalhos de demonstracao."""

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "demo_mode": bool(getattr(settings, "DEMO_MODE", False)),
                "accounts": [
                    {"role": "admin", "label": "Admin demo"},
                    {"role": "barbeiro", "label": "Barbeiro demo"},
                    {"role": "cliente", "label": "Cliente demo"},
                ]
                if getattr(settings, "DEMO_MODE", False)
                else [],
            }
        )


class DemoLoginView(APIView):
    """Login com um clique para as contas ficticias (apenas com DEMO_MODE=True)."""

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]

    # role -> (username, chave da senha nas settings)
    ACCOUNTS = {
        "admin": ("admin", "DEMO_ADMIN_PASSWORD"),
        "barbeiro": ("barbeiro1", "DEMO_SEED_PASSWORD"),
        "cliente": ("cliente1", "DEMO_SEED_PASSWORD"),
    }

    def post(self, request):
        if not getattr(settings, "DEMO_MODE", False):
            return Response({"detail": "Nao encontrado."}, status=status.HTTP_404_NOT_FOUND)

        role = str(request.data.get("role", "")).strip().lower()
        account = self.ACCOUNTS.get(role)
        if account is None:
            return Response({"detail": "Perfil invalido."}, status=status.HTTP_400_BAD_REQUEST)

        username, password_setting = account
        user = User.objects.filter(username=username).first()
        password = str(getattr(settings, password_setting, "") or "")
        if user is None or not password or not user.check_password(password):
            return Response(
                {"detail": "Contas demo indisponiveis. Execute seed_demo."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        payload = request.data.copy()
        if not payload.get("username"):
            # Alinhar ao e-mail normalizado (evita username com maiúsculas vs email em minúsculas no login).
            email_raw = str(payload.get("email", "") or "").strip()
            payload["username"] = email_raw.lower() if "@" in email_raw else email_raw

        payload["role"] = payload.get("role", "cliente")
        serializer = RegisterSerializer(data=payload)
        if serializer.is_valid():
            user = serializer.save()
            return Response(
                {
                    "message": "Conta criada com sucesso.",
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Perfil atual — sem expiração em massa de pacotes (isso corre via cron:
        `manage.py expire_outdated_subscriptions` e ao listar assinaturas).
        """
        t0 = time.perf_counter()
        serializer = UserSerializer(request.user)
        data = serializer.data
        t1 = time.perf_counter()
        if _auth_timing_enabled():
            logger.info(
                "[auth_timing] user GET serialize_ms=%.0f user_id=%s",
                (t1 - t0) * 1000,
                getattr(request.user, "pk", None),
            )
        return Response(data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = str(request.data.get("refresh", "")).strip()
        if not refresh_token:
            return Response(
                {"refresh": "Informe o refresh token para encerrar a sessão."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except (TokenError, AttributeError):
            return Response(
                {"detail": "Não foi possível invalidar o token informado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Logout realizado com sucesso."}, status=status.HTTP_200_OK)


class PasswordChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        current_password = serializer.validated_data["current_password"]
        new_password = serializer.validated_data["new_password"]

        user = request.user
        if not user.check_password(current_password):
            return Response(
                {"current_password": "Senha atual incorreta."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Senha alterada com sucesso."}, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["identifier"].strip()

        user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()

        # Sempre retorna sucesso para evitar enumeração de usuários.
        default_response = {
            "detail": "Se o usuário existir, você receberá instruções para redefinir sua senha.",
        }
        if not user or not user.email:
            return Response(default_response, status=status.HTTP_200_OK)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = str(
            getattr(settings, "FRONTEND_URL", "http://localhost:5173"),
        ).rstrip("/")
        reset_link = f"{frontend_url}/redefinir-senha?uid={uid}&token={token}"

        try:
            send_mail(
                subject="Redefinição de senha - Barbearia Demo",
                message=(
                    "Recebemos seu pedido de recuperação de senha.\n\n"
                    f"Para redefinir, acesse este link:\n{reset_link}\n\n"
                    "Se você não solicitou esta alteração, ignore este e-mail."
                ),
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@localhost"),
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            # Evita expor falha de infraestrutura para o cliente.
            pass

        return Response(default_response, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except Exception:
            return Response({"detail": "Link inválido ou expirado."}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({"detail": "Link inválido ou expirado."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Senha redefinida com sucesso."}, status=status.HTTP_200_OK)


class AvailabilityView(APIView):
    permission_classes = [permissions.AllowAny]
    STEP_MINUTES = 30

    @staticmethod
    def _parse_date(date_str: str):
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None

    def _resolve_duration(self, service_id: str) -> int:
        if not service_id:
            return 30
        try:
            service = Service.objects.filter(id=int(service_id), is_active=True).first()
        except (TypeError, ValueError):
            service = None
        if service:
            return int(service.duration_minutes or 30)
        return appointment_duration_minutes(service_id)

    def _resolve_barber(self, barber_id: str):
        try:
            return Barber.objects.select_related("user").get(
                id=int(barber_id),
                is_available=True,
                user__role=User.ROLE_BARBEIRO,
            )
        except (TypeError, ValueError, Barber.DoesNotExist):
            return None

    @staticmethod
    def _resolve_barber_by_calendar_key(barber_key: str):
        key = (barber_key or "").strip()
        if not key:
            return None
        return (
            Barber.objects.select_related("user")
            .filter(
                calendar_key__iexact=key,
                is_available=True,
                user__role=User.ROLE_BARBEIRO,
            )
            .first()
        )

    def get(self, request):
        barber_id = request.query_params.get("barber_id")
        barber_key = (request.query_params.get("barber_key") or "").strip()
        date_str = request.query_params.get("date")
        service_id = request.query_params.get("service_id")

        barber = self._resolve_barber(barber_id) if barber_id else None
        if barber is None and barber_key:
            barber = self._resolve_barber_by_calendar_key(barber_key)
        target_date = self._parse_date(str(date_str or ""))
        if not barber:
            return Response({"detail": "Barbeiro inválido."}, status=status.HTTP_400_BAD_REQUEST)
        if not target_date:
            return Response({"detail": "Data inválida. Use o formato YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        duration = self._resolve_duration(str(service_id or ""))
        weekday = target_date.weekday()

        business = BusinessHours.objects.filter(weekday=weekday).first()
        if business and not business.is_open:
            return Response(
                {"available_slots": [], "detail": "Barbearia fechada nesta data."},
                status=status.HTTP_200_OK,
            )

        default_open = datetime.strptime("09:00", "%H:%M").time()
        default_close = datetime.strptime("20:00", "%H:%M").time()
        open_time = business.open_time if business else default_open
        close_time = business.close_time if business else default_close

        tz = ZoneInfo(str(settings.TIME_ZONE))
        now_local = timezone.now().astimezone(tz)
        open_dt = datetime.combine(target_date, open_time, tzinfo=tz)
        close_dt = datetime.combine(target_date, close_time, tzinfo=tz)

        blocks = BlockedSlot.objects.filter(date=target_date).filter(
            Q(barber_calendar_key="") | Q(barber_calendar_key__iexact=(barber.calendar_key or "").strip()),
        )

        blocking_intervals = aware_blocking_intervals(target_date, barber, tz)

        slots = []
        cursor = open_dt
        while cursor + timedelta(minutes=duration) <= close_dt:
            slot_end = cursor + timedelta(minutes=duration)
            slot_key = cursor.strftime("%H:%M")
            is_past = target_date == now_local.date() and cursor <= now_local
            is_taken = aware_slot_overlaps_intervals(cursor, duration, blocking_intervals)
            is_blocked = False
            for block in blocks:
                block_start = datetime.combine(target_date, block.start_time, tzinfo=tz)
                block_end = datetime.combine(target_date, block.end_time, tzinfo=tz)
                if cursor < block_end and slot_end > block_start:
                    is_blocked = True
                    break
            if not is_past and not is_taken and not is_blocked:
                slots.append(slot_key)
            cursor += timedelta(minutes=self.STEP_MINUTES)

        return Response(
            {
                "barber_id": barber.id,
                "barber_key": barber.calendar_key,
                "date": target_date.isoformat(),
                "duration_minutes": duration,
                "available_slots": slots,
            },
            status=status.HTTP_200_OK,
        )


class BusinessHoursListCreateView(generics.ListCreateAPIView):
    queryset = BusinessHours.objects.all().order_by("weekday")
    serializer_class = BusinessHoursSerializer

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsAdminRole()]


class BusinessHoursDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = BusinessHours.objects.all()
    serializer_class = BusinessHoursSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class BlockedSlotListCreateView(generics.ListCreateAPIView):
    serializer_class = BlockedSlotSerializer

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsAdminRole()]

    def get_queryset(self):
        queryset = BlockedSlot.objects.all().order_by("date", "start_time")
        date_value = self.request.query_params.get("date")
        barber_key = (self.request.query_params.get("barber_calendar_key") or "").strip().lower()
        if date_value:
            queryset = queryset.filter(date=date_value)
        if barber_key:
            queryset = queryset.filter(Q(barber_calendar_key="") | Q(barber_calendar_key=barber_key))
        return queryset


class BlockedSlotDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = BlockedSlot.objects.all()
    serializer_class = BlockedSlotSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class BlockTemplateListCreateView(generics.ListCreateAPIView):
    serializer_class = BlockTemplateSerializer

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsAdminRole()]

    def get_queryset(self):
        queryset = BlockTemplate.objects.all()
        active_only = str(self.request.query_params.get("active", "")).strip().lower()
        if active_only in {"1", "true", "yes"}:
            queryset = queryset.filter(is_active=True)
        return queryset.order_by("name")


class BlockTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = BlockTemplate.objects.all()
    serializer_class = BlockTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class ClientPackageListView(generics.ListAPIView):
    serializer_class = ClientPackageSerializer

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsAdminRole()]

    def get_queryset(self):
        queryset = ClientPackage.objects.all()
        if getattr(self.request.user, "role", None) == "admin":
            for pkg in queryset:
                self._sync_package_to_saas_plan(pkg)
            return queryset.order_by("price", "name")
        return queryset.filter(is_active=True).order_by("price", "name")

    @staticmethod
    def _sync_package_to_saas_plan(pkg: ClientPackage):
        slug = slugify(pkg.name or "")[:40]
        if not slug:
            slug = f"pacote-{pkg.id}"
        monthly = Decimal(str(pkg.price or "0"))
        yearly = (monthly * Decimal("12") * Decimal("0.90")).quantize(Decimal("0.01"))
        session_basis = 999 if getattr(pkg, "sessions_unlimited", False) else max(1, int(pkg.sessions or 1))
        max_barbers = max(2, session_basis * 2)
        max_monthly_appointments = max(100, session_basis * 100)
        sessions_feature = (
            "Sessões ilimitadas (na vigência)"
            if getattr(pkg, "sessions_unlimited", False)
            else f"{int(pkg.sessions or 1)} sessões"
        )
        features = [
            sessions_feature,
            f"Validade de {int(pkg.validity_days or 30)} dias",
        ]
        SaaSPlan.objects.update_or_create(
            slug=slug,
            defaults={
                "name": pkg.name,
                "monthly_price": monthly,
                "yearly_price": yearly,
                "max_barbers": max_barbers,
                "max_monthly_appointments": max_monthly_appointments,
                "features": features,
                "is_active": bool(pkg.is_active),
            },
        )


class ClientPackageDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ClientPackageSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    queryset = ClientPackage.objects.all().order_by("price", "name")

    @staticmethod
    def _plan_slug_for_package(pkg: ClientPackage) -> str:
        slug = slugify(pkg.name or "")[:40]
        return slug or f"pacote-{pkg.id}"

    def perform_update(self, serializer):
        pkg = serializer.save()
        ClientPackageListView._sync_package_to_saas_plan(pkg)

    def perform_destroy(self, instance):
        plan_slug = self._plan_slug_for_package(instance)
        instance.delete()
        SaaSPlan.objects.filter(slug=plan_slug).delete()


class ClientPackageSubscriptionCreateView(generics.CreateAPIView):
    serializer_class = ClientPackageSubscriptionSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        subscription = serializer.save()
        package = subscription.package
        sessions_line = (
            "Ilimitadas (na vigência do plano)"
            if getattr(subscription, "sessions_unlimited", False)
            else str(subscription.sessions_total)
        )
        message = (
            "Recebemos sua solicitação de pacote com sucesso!\n\n"
            f"Pacote: {package.name}\n"
            f"Sessões: {sessions_line}\n"
            f"Valor: R$ {package.price}\n\n"
            "Em breve entraremos em contato para finalizar sua contratação."
        )
        send_whatsapp_text(
            subscription.phone,
            message,
            event_type="package_subscription_requested",
            appointment=None,
        )
        send_profile_email(
            subscription.email,
            "Solicitação de pacote recebida - Barbearia Demo",
            message,
            event_type="package_subscription_requested_email",
            appointment=None,
        )


class ClientPackageSubscriptionListView(generics.ListAPIView):
    serializer_class = ClientPackageSubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        expire_outdated_client_package_subscriptions()
        user = self.request.user
        base = ClientPackageSubscription.objects.select_related("package", "customer")
        role = str(getattr(user, "role", "") or "").strip().lower()
        is_admin_user = role in {"admin", "administrador"} or bool(getattr(user, "is_staff", False)) or bool(
            getattr(user, "is_superuser", False)
        )
        if is_admin_user:
            return base.order_by("-created_at")
        if role == "barbeiro":
            cutoff = timezone.now() - timedelta(days=120)
            return base.filter(
                Q(
                    status__in=[
                        ClientPackageSubscription.STATUS_PENDING,
                        ClientPackageSubscription.STATUS_ACTIVE,
                    ],
                )
                | Q(
                    status=ClientPackageSubscription.STATUS_EXPIRED,
                    updated_at__gte=cutoff,
                )
            ).order_by("-created_at")
        today = timezone.localdate()
        owner = Q(customer=user)
        email_normalized = str(getattr(user, "email", "") or "").strip().lower()
        if email_normalized:
            owner |= Q(email__iexact=email_normalized)
        active_in_validity = Q(
            status=ClientPackageSubscription.STATUS_ACTIVE,
            starts_at__isnull=False,
            starts_at__lte=today,
            ends_at__isnull=False,
            ends_at__gte=today,
        )
        # Inclui expirados recentes para o cliente ver no site (ex.: sessões esgotadas) sem misturar com admin.
        expired_recent = Q(
            status=ClientPackageSubscription.STATUS_EXPIRED,
            updated_at__gte=timezone.now() - timedelta(days=366),
        )
        return base.filter(owner).filter(active_in_validity | expired_recent).order_by("-created_at")


class ClientPackageLoginNoticeDismissView(APIView):
    """Cliente dispensa o aviso de plano/sessões encerradas (próximo login)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        if getattr(user, "role", None) != User.ROLE_CLIENTE:
            return Response({"detail": "Apenas clientes podem confirmar este aviso."}, status=status.HTTP_403_FORBIDDEN)
        sub = get_object_or_404(ClientPackageSubscription.objects.all(), pk=pk)
        email_u = str(getattr(user, "email", "") or "").strip().lower()
        own = sub.customer_id == user.id or (bool(email_u) and sub.email.strip().lower() == email_u)
        if not own:
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
        if sub.pending_login_notice:
            sub.pending_login_notice = False
            sub.save(update_fields=["pending_login_notice", "updated_at"])
        return Response({"detail": "ok"})


class ClientPackageSubscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ClientPackageSubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    queryset = ClientPackageSubscription.objects.select_related("package", "customer").all()


class AppointmentListCreateView(generics.ListCreateAPIView):
    serializer_class = AppointmentSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        base = Appointment.objects.all()
        user = self.request.user
        if not user.is_authenticated:
            return Appointment.objects.none()
        role = getattr(user, "role", None)
        if role == "admin":
            return base.select_related("package_subscription__package").order_by("-created_at")
        if role == "barbeiro":
            try:
                barber = Barber.objects.select_related("user").get(user=user)
            except Barber.DoesNotExist:
                return Appointment.objects.none()
            key = (barber.calendar_key or "").strip()
            if not key:
                return Appointment.objects.none()
            today = timezone.localdate()
            return (
                base.filter(barber__iexact=key, date__gte=today)
                .select_related("package_subscription__package")
                .order_by("date", "time", "id")
            )
        return base.filter(
            Q(customer=user) | Q(customer__isnull=True, email__iexact=user.email),
        ).order_by("-date", "-time", "-id")

    def perform_create(self, serializer):
        if not subscription_allows_bookings():
            raise PermissionDenied(
                "Agendamentos temporariamente indisponíveis por pendência de assinatura do sistema.",
            )
        user = self.request.user if self.request.user.is_authenticated else None
        appointment = create_appointment(user, serializer.validated_data)
        serializer.instance = appointment
        send_whatsapp_text(
            appointment.phone,
            (
                "Barbearia Demo: seu agendamento foi recebido com sucesso! "
                f"Serviço: {appointment.get_service_display()} | "
                f"Data: {appointment.date.strftime('%d/%m/%Y')} às {appointment.time.strftime('%H:%M')}."
            ),
            event_type="appointment_created",
            appointment=appointment,
        )
        recipient_email = (
            (getattr(appointment.customer, "email", "") if appointment.customer else "")
            or appointment.email
        )
        send_profile_email(
            recipient_email,
            "Agendamento recebido - Barbearia Demo",
            (
                "Seu agendamento foi registrado com sucesso.\n\n"
                f"Serviço: {appointment.get_service_display()}\n"
                f"Data: {appointment.date.strftime('%d/%m/%Y')}\n"
                f"Horário: {appointment.time.strftime('%H:%M')}\n\n"
                "Se precisar alterar, acesse sua conta no site."
            ),
            event_type="appointment_created_email",
            appointment=appointment,
        )


class AppointmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Appointment.objects.select_related("package_subscription__package").all()
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsAppointmentStaffOrOwnerOrAdmin]

    @staticmethod
    def _consume_package_session_if_needed(appointment: Appointment, old_status: str, new_status: str):
        if old_status == Appointment.STATUS_CONCLUIDO or new_status != Appointment.STATUS_CONCLUIDO:
            return
        if appointment.package_subscription_id:
            return

        subscription_qs = ClientPackageSubscription.objects.select_related("package").filter(
            status=ClientPackageSubscription.STATUS_ACTIVE,
        )

        match = Q()
        if appointment.customer_id:
            match |= Q(customer_id=appointment.customer_id)
        email = (appointment.email or "").strip().lower()
        if email:
            match |= Q(email__iexact=email)
        if not match:
            return
        subscription_qs = subscription_qs.filter(match)

        today = timezone.localdate()
        subscription = (
            subscription_qs.filter(
                Q(starts_at__isnull=True) | Q(starts_at__lte=today),
                Q(ends_at__isnull=True) | Q(ends_at__gte=today),
            )
            .order_by("-created_at")
            .first()
        )
        if not subscription:
            return
        if getattr(subscription, "sessions_unlimited", False):
            appointment.package_subscription = subscription
            appointment.save(update_fields=["package_subscription", "updated_at"])
            return
        if subscription.sessions_used >= subscription.sessions_total:
            return

        subscription.sessions_used += 1
        update_fields = ["sessions_used", "updated_at"]
        if subscription.sessions_used >= subscription.sessions_total:
            update_fields.extend(apply_sessions_depleted_on_last_consume(subscription, today))
        subscription.save(update_fields=update_fields)
        appointment.package_subscription = subscription
        appointment.save(update_fields=["package_subscription", "updated_at"])

    @staticmethod
    def _refund_package_session_if_needed(appointment: Appointment, old_status: str, new_status: str):
        if old_status != Appointment.STATUS_CONCLUIDO or new_status == Appointment.STATUS_CONCLUIDO:
            return

        subscription = appointment.package_subscription
        if not subscription:
            return

        if subscription.sessions_used > 0:
            subscription.sessions_used -= 1
            update_fields = ["sessions_used", "updated_at"]
            if subscription.sessions_used < subscription.sessions_total:
                if (subscription.login_notice_reason or "").strip() == "sessions_depleted":
                    subscription.pending_login_notice = False
                    subscription.login_notice_reason = ""
                    update_fields.extend(["pending_login_notice", "login_notice_reason"])
            if (
                subscription.status == ClientPackageSubscription.STATUS_EXPIRED
                and subscription.sessions_used < subscription.sessions_total
            ):
                today = timezone.localdate()
                starts_ok = not subscription.starts_at or subscription.starts_at <= today
                ends_ok = not subscription.ends_at or subscription.ends_at >= today
                if starts_ok and ends_ok:
                    subscription.status = ClientPackageSubscription.STATUS_ACTIVE
                    update_fields.append("status")
            subscription.save(update_fields=update_fields)

        appointment.package_subscription = None
        appointment.save(update_fields=["package_subscription", "updated_at"])

    def perform_update(self, serializer):
        appointment_before = self.get_object()
        old_status = appointment_before.status
        appointment = serializer.save()
        self._consume_package_session_if_needed(appointment, old_status, appointment.status)
        self._refund_package_session_if_needed(appointment, old_status, appointment.status)

        pm = getattr(serializer, "_barber_presencial_payment_method", None)
        if pm not in ("dinheiro", "pix"):
            body = getattr(self.request, "data", None)
            if isinstance(body, dict):
                alt = str(body.get("payment_method") or "").strip().lower()
                if alt in ("dinheiro", "pix"):
                    pm = alt

        appointment.refresh_from_db()
        if (
            getattr(self.request.user, "role", None) == "barbeiro"
            and old_status == Appointment.STATUS_EM_ANDAMENTO
            and appointment.status == Appointment.STATUS_CONCLUIDO
        ):
            if appointment.package_subscription_id:
                Appointment.objects.filter(pk=appointment.pk).update(closing_payment_method="pacote")
                from billing.appointment_payments import record_package_payment_transaction

                record_package_payment_transaction(appointment)
            elif pm in ("dinheiro", "pix"):
                Appointment.objects.filter(pk=appointment.pk).update(closing_payment_method=pm)

        if (
            pm in ("dinheiro", "pix")
            and old_status == Appointment.STATUS_EM_ANDAMENTO
            and appointment.status == Appointment.STATUS_CONCLUIDO
            and getattr(self.request.user, "role", None) == "barbeiro"
        ):
            appointment.refresh_from_db()
            if not appointment.package_subscription_id:
                from billing.appointment_payments import record_presencial_payment

                record_presencial_payment(appointment, pm)


class AdminUserListView(generics.ListAPIView):
    queryset = User.objects.select_related("barber_profile").all().order_by("-date_joined")
    serializer_class = AdminUserSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class AdminUserDetailView(generics.RetrieveUpdateAPIView):
    queryset = User.objects.select_related("barber_profile").all()
    serializer_class = AdminUserSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    @staticmethod
    def _build_unique_calendar_key(user: User) -> str:
        raw_base = user.get_full_name() or user.username or f"barbeiro-{user.id}"
        base = slugify(raw_base).replace("-", "_") or f"barbeiro_{user.id}"
        key = base
        suffix = 2
        while Barber.objects.exclude(user=user).filter(calendar_key=key).exists():
            key = f"{base}_{suffix}"
            suffix += 1
        return key

    def perform_update(self, serializer):
        prev_role = serializer.instance.role
        user = serializer.save()
        barber_specialties = str(self.request.data.get("barber_specialties", "")).strip()
        if getattr(user, "role", None) == User.ROLE_BARBEIRO:
            barber_profile, created = Barber.objects.get_or_create(user=user)
            update_fields: list[str] = []
            if created or not (barber_profile.calendar_key or "").strip():
                barber_profile.calendar_key = self._build_unique_calendar_key(user)
                update_fields.append("calendar_key")
            if created or prev_role != User.ROLE_BARBEIRO:
                barber_profile.hired_at = timezone.now()
                update_fields.append("hired_at")
            if not barber_profile.is_available:
                barber_profile.is_available = True
                update_fields.append("is_available")
            if barber_profile.specialties != barber_specialties:
                barber_profile.specialties = barber_specialties
                update_fields.append("specialties")
            if update_fields:
                update_fields.append("updated_at")
                barber_profile.save(update_fields=list(dict.fromkeys(update_fields)))
        else:
            try:
                barber_profile = user.barber_profile
            except Barber.DoesNotExist:
                barber_profile = None
            if barber_profile and barber_profile.is_available:
                barber_profile.is_available = False
                barber_profile.save(update_fields=["is_available", "updated_at"])


class PortfolioSiteConfigView(APIView):
    """GET público; PUT/DELETE apenas admin — personaliza portfólio do site."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsAdminRole()]

    def get(self, request):
        row = PortfolioSiteConfig.objects.order_by("id").first()
        if not row or not (row.categories or []):
            return Response({"configured": False})
        return Response(
            {
                "configured": True,
                "categories": row.categories or [],
                "items": row.items or [],
                "updated_at": row.updated_at.isoformat(),
            }
        )

    def put(self, request):
        serializer = PortfolioSiteConfigWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        row = PortfolioSiteConfig.objects.order_by("id").first()
        if row:
            row.categories = serializer.validated_data["categories"]
            row.items = serializer.validated_data["items"]
            row.save(update_fields=["categories", "items", "updated_at"])
        else:
            row = PortfolioSiteConfig.objects.create(
                categories=serializer.validated_data["categories"],
                items=serializer.validated_data["items"],
            )
        return Response(
            {
                "configured": True,
                "categories": row.categories,
                "items": row.items,
                "updated_at": row.updated_at.isoformat(),
            }
        )

    def delete(self, request):
        PortfolioSiteConfig.objects.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _portfolio_upload_public_url(request, stored_relative_path: str) -> str:
    """URL absoluta para o front exibir a imagem (BACKEND_PUBLIC_URL ou host da requisição)."""
    media_url = settings.MEDIA_URL.rstrip("/")
    rel = f"{media_url}/{stored_relative_path.lstrip('/')}"
    base = (getattr(settings, "BACKEND_PUBLIC_URL", None) or "").strip().rstrip("/")
    if base:
        return f"{base}{rel}"
    return request.build_absolute_uri(rel)


class PortfolioImageUploadView(APIView):
    """Upload de imagem do portfólio (admin). Salva em MEDIA_ROOT/portfolio/."""

    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    MAX_BYTES = 8 * 1024 * 1024
    ALLOWED_TYPES = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }

    def post(self, request):
        upload = request.FILES.get("file") or request.FILES.get("image")
        if not upload:
            return Response(
                {"detail": "Nenhum arquivo enviado. Use o campo multipart file ou image."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > self.MAX_BYTES:
            return Response(
                {"detail": "Arquivo muito grande. Tamanho máximo: 8 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        ext = self.ALLOWED_TYPES.get(content_type)
        if not ext:
            return Response(
                {"detail": "Formato não permitido. Envie JPG, PNG, WEBP ou GIF."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        filename = f"portfolio/{uuid.uuid4().hex}{ext}"
        saved_path = default_storage.save(filename, upload)
        url = _portfolio_upload_public_url(request, saved_path)
        return Response({"url": url, "path": saved_path}, status=status.HTTP_201_CREATED)


class AdminUserResetPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def post(self, request, pk: int):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        new_password = str(request.data.get("password", "")).strip()
        if len(new_password) < 8:
            return Response(
                {"password": "A senha temporária deve ter no mínimo 8 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_user.set_password(new_password)
        target_user.save(update_fields=["password"])
        return Response({"detail": "Senha redefinida com sucesso."}, status=status.HTTP_200_OK)
