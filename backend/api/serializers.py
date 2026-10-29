import logging
import time
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.db.models import Q
from django.utils import timezone
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings

from barbers.models import Barber
from .booking_slots import (
    appointment_duration_minutes,
    barber_matching_q,
    canonical_appointment_barber_key,
    naive_interval_for_appointment,
    overlaps_interval_naive,
)
from .models import (
    Appointment,
    BlockTemplate,
    BlockedSlot,
    BusinessHours,
    ClientPackage,
    ClientPackageSubscription,
)

User = get_user_model()

_auth_logger = logging.getLogger("api.auth")


def _serializer_auth_timing() -> bool:
    return bool(getattr(settings, "AUTH_TIMING_DEBUG", False))


def _subscription_eligible_for_session_close(sub: Optional[ClientPackageSubscription], today: date) -> bool:
    """Pacote cobre o atendimento só se ativo, na vigência e ainda com sessão disponível."""
    if not sub or sub.status != ClientPackageSubscription.STATUS_ACTIVE:
        return False
    if sub.starts_at and sub.starts_at > today:
        return False
    if sub.ends_at and sub.ends_at < today:
        return False
    if getattr(sub, "sessions_unlimited", False):
        return True
    if sub.sessions_used >= sub.sessions_total:
        return False
    return True


def apply_sessions_depleted_on_last_consume(subscription: ClientPackageSubscription, today: date) -> list[str]:
    """
    Após consumir a última sessão: aviso ao cliente; status expirado só quando não há
    ends_at ou o prazo assinado já passou — enquanto ends_at >= hoje o plano segue ativo na lista.
    """
    subscription.pending_login_notice = True
    subscription.login_notice_reason = "sessions_depleted"
    fields = ["pending_login_notice", "login_notice_reason"]
    ends = subscription.ends_at
    if ends is None or ends < today:
        subscription.status = ClientPackageSubscription.STATUS_EXPIRED
        fields.append("status")
    return fields


def active_package_for_presencial_close(appointment: Appointment):
    """
    Indica encerramento coberto por pacote (não exige payment_method dinheiro/pix).

    - Se o agendamento já está vinculado a uma assinatura, o fechamento é por pacote
      (espelha o ramo inicial de _consume_package_session_if_needed).
    - Caso contrário, procura assinatura ativa com sessão disponível para consumir ao concluir.
    """
    if not appointment:
        return None
    today = _calendar_today_barbearia()
    if appointment.package_subscription_id:
        sub = (
            ClientPackageSubscription.objects.select_related("package")
            .filter(pk=appointment.package_subscription_id)
            .first()
        )
        return sub if _subscription_eligible_for_session_close(sub, today) else None
    subscription_qs = ClientPackageSubscription.objects.select_related("package").filter(
        status=ClientPackageSubscription.STATUS_ACTIVE,
    )
    # Cliente pode ter assinatura ligada só por e-mail (customer nulo) e agendamento com user — usar OU.
    match = Q()
    if appointment.customer_id:
        match |= Q(customer_id=appointment.customer_id)
    email = (appointment.email or "").strip().lower()
    if email:
        match |= Q(email__iexact=email)
    if not match:
        return None
    subscription_qs = subscription_qs.filter(match)
    subscription = (
        subscription_qs.filter(
            Q(starts_at__isnull=True) | Q(starts_at__lte=today),
            Q(ends_at__isnull=True) | Q(ends_at__gte=today),
        )
        .order_by("-created_at")
        .first()
    )
    if not _subscription_eligible_for_session_close(subscription, today):
        return None
    return subscription


def _normalize_phone(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _ensure_unique_phone(phone_value: str, *, exclude_user_id=None):
    normalized = _normalize_phone(phone_value)
    if not normalized:
        return phone_value
    for user in User.objects.exclude(pk=exclude_user_id).exclude(phone__isnull=True):
        if _normalize_phone(getattr(user, "phone", "")) == normalized:
            raise serializers.ValidationError("Este telefone já está em uso por outro usuário.")
    return phone_value


def _calendar_today_barbearia() -> date:
    """Data civil em America/Sao_Paulo (evita divergência com timezone.activate em requests)."""
    tz = ZoneInfo(str(settings.TIME_ZONE))
    return datetime.now(tz).date()


class UserSerializer(serializers.ModelSerializer):
    pending_package_notices = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "pending_package_notices",
        ]
        read_only_fields = ["id", "role", "pending_package_notices"]

    def get_pending_package_notices(self, obj):
        if getattr(obj, "role", None) != User.ROLE_CLIENTE:
            return []
        # Inclui plano ainda "active" com aviso: ao esgotar sessões com ends_at futuro,
        # apply_sessions_depleted mantém status ativo até a data — o modal deve aparecer na mesma.
        owner = Q(customer=obj)
        email_normalized = str(getattr(obj, "email", "") or "").strip().lower()
        if email_normalized:
            owner |= Q(email__iexact=email_normalized)
        qs = (
            ClientPackageSubscription.objects.filter(owner, pending_login_notice=True)
            .select_related("package")
            .order_by("-updated_at")[:12]
        )
        return [
            {
                "id": s.id,
                "package_name": getattr(s.package, "name", "") or "Pacote",
                "reason": (s.login_notice_reason or "sessions_depleted").strip(),
            }
            for s in qs
        ]

    def validate_email(self, value):
        email = str(value or "").strip().lower()
        qs = User.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(email__iexact=email)
        if qs.exists():
            raise serializers.ValidationError("Este e-mail já está em uso.")
        return email

    def validate_phone(self, value):
        return _ensure_unique_phone(value, exclude_user_id=getattr(self.instance, "pk", None))


class AdminUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    barber_specialties = serializers.SerializerMethodField()
    barber_hired_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "role",
            "is_active",
            "date_joined",
            "barber_specialties",
            "barber_hired_at",
        ]
        read_only_fields = ["id", "date_joined"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_barber_specialties(self, obj):
        try:
            return (obj.barber_profile.specialties or "").strip()
        except Barber.DoesNotExist:
            return ""

    def get_barber_hired_at(self, obj):
        if getattr(obj, "role", None) != User.ROLE_BARBEIRO:
            return None
        try:
            hr = obj.barber_profile.hired_at
            return hr.isoformat() if hr else None
        except Barber.DoesNotExist:
            return None

    def validate_username(self, value):
        username = str(value or "").strip()
        if not username:
            raise serializers.ValidationError("Informe o login (nome de usuário).")
        qs = User.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(username=username)
        if qs.exists():
            raise serializers.ValidationError("Este login já está em uso por outra conta.")
        return username

    def validate_email(self, value):
        email = str(value or "").strip().lower()
        qs = User.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(email__iexact=email)
        if qs.exists():
            raise serializers.ValidationError("Este e-mail já está em uso.")
        return email

    def validate_phone(self, value):
        return _ensure_unique_phone(value, exclude_user_id=getattr(self.instance, "pk", None))


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password", "first_name", "phone", "role"]
        extra_kwargs = {
            "role": {"required": False},
            "username": {"required": False},
        }

    def validate_email(self, value):
        email = str(value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Este e-mail já está em uso.")
        return email

    def validate_phone(self, value):
        return _ensure_unique_phone(value)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Aceita o campo JWT padrão `username` com nome de utilizador **ou** e-mail.
    Normaliza espaços e e-mail em minúsculas para evitar falhas com credenciais válidas.

    Não chama ``super().validate()`` do SimpleJWT: esse caminho voltaria a correr
    ``authenticate()`` com a mesma palavra-passe (custo duplicado de hash).
    Reutiliza a mesma lógica de tokens e ``update_last_login`` do serializer original.
    """

    def validate(self, attrs):
        t0 = time.perf_counter()
        raw_identifier = attrs.get("username") or ""
        identifier = str(raw_identifier).strip()
        password = attrs.get("password")

        if identifier:
            attrs["username"] = identifier

        request = self.context.get("request")

        user = authenticate(request, username=identifier, password=password)

        if user is None and identifier:
            UserModel = get_user_model()
            email_key = identifier.lower()
            user_obj = UserModel.objects.filter(email__iexact=email_key).only("username").first()

            if user_obj is not None:
                attrs["username"] = user_obj.username
                user = authenticate(
                    request,
                    username=user_obj.username,
                    password=password,
                )

        t_after_auth = time.perf_counter()

        if user is None:
            raise serializers.ValidationError(
                "Credenciais inválidas. Use seu usuário ou e-mail e senha corretos.",
            )

        if not api_settings.USER_AUTHENTICATION_RULE(user):
            raise exceptions.AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )

        self.user = user

        refresh = self.get_token(self.user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
        t_after_tokens = time.perf_counter()

        if api_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, self.user)
        t_end = time.perf_counter()

        if _serializer_auth_timing():
            _auth_logger.info(
                "[auth_timing] login_serializer auth_ms=%.0f token_ms=%.0f last_login_ms=%.0f total_ms=%.0f",
                (t_after_auth - t0) * 1000,
                (t_after_tokens - t_after_auth) * 1000,
                (t_end - t_after_tokens) * 1000,
                (t_end - t0) * 1000,
            )

        return data


class AppointmentSerializer(serializers.ModelSerializer):
    """payment_method: obrigatório ao barbeiro encerrar atendimento (dinheiro | pix), exceto quando coberto por pacote."""

    payment_method = serializers.CharField(write_only=True, required=False, allow_blank=True)
    closing_payment_display = serializers.SerializerMethodField()
    package_close_available = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Appointment
        fields = "__all__"
        read_only_fields = [
            "id",
            "customer",
            "created_at",
            "updated_at",
            "closing_payment_display",
            "closing_payment_method",
            "package_close_available",
        ]

    def get_package_close_available(self, obj):
        """True se este agendamento pode ser encerrado consumindo sessão de pacote (há sessão e vigência)."""
        try:
            return active_package_for_presencial_close(obj) is not None
        except Exception:
            return False

    def get_closing_payment_display(self, obj):
        m = (getattr(obj, "closing_payment_method", None) or "").strip().lower()
        if m == "pacote":
            sub = getattr(obj, "package_subscription", None)
            try:
                if sub and sub.package_id:
                    return f"Pacote · {sub.package.name}"
            except Exception:
                pass
            return "Pacote"
        if m == "dinheiro":
            return "Dinheiro"
        if m == "pix":
            return "Pix"
        return ""

    def _resolve_duration(self, service_key: str) -> int:
        return appointment_duration_minutes(service_key)

    @staticmethod
    def _combine(date_value: date, time_value: dt_time) -> datetime:
        return datetime.combine(date_value, time_value)

    def _validate_business_hours(self, booking_date: date, booking_time: dt_time, duration: int):
        weekday = booking_date.weekday()
        business = BusinessHours.objects.filter(weekday=weekday).first()
        if business and not business.is_open:
            raise serializers.ValidationError({"date": "A barbearia está fechada para a data escolhida."})
        if not business:
            return

        start_dt = self._combine(booking_date, booking_time)
        end_dt = start_dt + timedelta(minutes=duration)
        open_dt = self._combine(booking_date, business.open_time)
        close_dt = self._combine(booking_date, business.close_time)

        if start_dt < open_dt or end_dt > close_dt:
            raise serializers.ValidationError(
                {"time": "O horário escolhido está fora do horário de funcionamento."},
            )

    def _validate_blocked_slots(self, booking_date: date, booking_time: dt_time, duration: int, booking_barber: str):
        start_dt = self._combine(booking_date, booking_time)
        end_dt = start_dt + timedelta(minutes=duration)
        barber_key = (booking_barber or "").strip()

        blocked = BlockedSlot.objects.filter(
            date=booking_date,
        ).filter(
            Q(barber_calendar_key="") | Q(barber_calendar_key__iexact=barber_key),
        )
        for slot in blocked:
            blocked_start = self._combine(booking_date, slot.start_time)
            blocked_end = self._combine(booking_date, slot.end_time)
            if start_dt < blocked_end and end_dt > blocked_start:
                raise serializers.ValidationError(
                    {"time": "O horário escolhido está bloqueado na agenda."},
                )

    def _validate_barber_active(self, booking_barber: str):
        raw = (booking_barber or "").strip()
        exists_active = (
            Barber.objects.filter(
                is_available=True,
                user__role=User.ROLE_BARBEIRO,
                calendar_key__iexact=raw,
            ).exists()
            or Barber.objects.filter(
                is_available=True,
                user__role=User.ROLE_BARBEIRO,
                user__username__iexact=raw,
            ).exists()
        )
        if not exists_active:
            raise serializers.ValidationError({"barber": "Barbeiro indisponível para agendamento."})

    def validate_date(self, value):
        today = _calendar_today_barbearia()
        if value < today:
            raise serializers.ValidationError("A data do agendamento não pode ser passada.")
        return value

    def validate(self, attrs):
        booking_date = attrs.get("date", getattr(self.instance, "date", None))
        booking_time = attrs.get("time", getattr(self.instance, "time", None))
        booking_barber = attrs.get("barber", getattr(self.instance, "barber", None))
        is_create = self.instance is None
        today = _calendar_today_barbearia()
        tz = ZoneInfo(str(settings.TIME_ZONE))

        if is_create:
            if booking_date == today and booking_time is None:
                raise serializers.ValidationError({"time": "Escolha um horário válido."})
            if (
                booking_date == today
                and booking_time is not None
                and isinstance(booking_time, dt_time)
            ):
                now_local = datetime.now(tz)
                slot_local = datetime.combine(booking_date, booking_time, tzinfo=tz)
                if slot_local <= now_local:
                    raise serializers.ValidationError(
                        {"time": "Para hoje, escolha um horário que ainda não tenha passado."},
                    )

        if booking_barber and booking_date and booking_time:
            self._validate_barber_active(booking_barber)
            canonical_barber = canonical_appointment_barber_key(booking_barber)
            attrs["barber"] = canonical_barber

            duration = self._resolve_duration(attrs.get("service", getattr(self.instance, "service", "")))
            self._validate_business_hours(booking_date, booking_time, duration)
            self._validate_blocked_slots(booking_date, booking_time, duration, canonical_barber)

            barber_prof = (
                Barber.objects.select_related("user")
                .filter(calendar_key__iexact=(canonical_barber or "").strip())
                .first()
            )
            conflicting = Appointment.objects.filter(
                date=booking_date,
                status__in=[
                    Appointment.STATUS_PENDING,
                    Appointment.STATUS_CONFIRMED,
                    Appointment.STATUS_EM_ANDAMENTO,
                ],
            )
            if barber_prof:
                conflicting = conflicting.filter(barber_matching_q(barber_prof))
            else:
                conflicting = conflicting.filter(barber__iexact=(canonical_barber or "").strip())

            if self.instance is not None:
                conflicting = conflicting.exclude(pk=self.instance.pk)

            new_start = self._combine(booking_date, booking_time)
            new_end = new_start + timedelta(minutes=duration)
            for apt in conflicting:
                ex_start, ex_end = naive_interval_for_appointment(booking_date, apt)
                if overlaps_interval_naive(new_start, new_end, ex_start, ex_end):
                    raise serializers.ValidationError(
                        {
                            "time": (
                                "Este horário já está ocupado ou sobrepõe outro "
                                "agendamento deste barbeiro. Escolha outro horário."
                            ),
                        },
                    )

        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        role = getattr(user, "role", None) if user and user.is_authenticated else None
        if self.instance and role == "barbeiro":
            new_status = attrs.get("status", self.instance.status)
            old_status = self.instance.status
            if (
                new_status == Appointment.STATUS_CONCLUIDO
                and old_status == Appointment.STATUS_EM_ANDAMENTO
            ):
                will_use_package = active_package_for_presencial_close(self.instance) is not None
                if will_use_package:
                    attrs.pop("payment_method", None)
                else:
                    pm = ""
                    if request is not None and hasattr(request, "data") and isinstance(request.data, dict):
                        pm = str(request.data.get("payment_method") or "").strip().lower()
                    if pm not in ("dinheiro", "pix"):
                        raise serializers.ValidationError(
                            {"payment_method": "Informe se o pagamento foi em dinheiro ou Pix."},
                        )
                    attrs["payment_method"] = pm
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data["customer"] = request.user
        return super().create(validated_data)

    def _apply_barber_rules(self, instance, validated_data):
        new_status = validated_data.get("status", instance.status)
        old = instance.status

        if new_status == Appointment.STATUS_EM_ANDAMENTO:
            if old not in (Appointment.STATUS_PENDING, Appointment.STATUS_CONFIRMED):
                raise serializers.ValidationError(
                    {"status": "Só é possível iniciar agendamentos pendentes ou confirmados."},
                )
            if validated_data.get("service_started_at") is None:
                validated_data["service_started_at"] = timezone.now()
        elif new_status == Appointment.STATUS_CONCLUIDO:
            if old != Appointment.STATUS_EM_ANDAMENTO:
                raise serializers.ValidationError(
                    {"status": "Só é possível concluir um atendimento em andamento."},
                )
            validated_data["service_started_at"] = None
        return validated_data

    def update(self, instance, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        role = getattr(user, "role", None) if user and user.is_authenticated else None
        if role != "barbeiro":
            validated_data.pop("payment_method", None)
        if role == "barbeiro":
            validated_data = {
                k: v
                for k, v in validated_data.items()
                if k in ("status", "service_started_at", "payment_method")
            }
            validated_data = self._apply_barber_rules(instance, validated_data)
            presencial_pm = validated_data.pop("payment_method", None)
            if presencial_pm not in ("dinheiro", "pix"):
                init = getattr(self, "initial_data", None)
                if isinstance(init, dict):
                    raw = str(init.get("payment_method") or "").strip().lower()
                    if raw in ("dinheiro", "pix"):
                        presencial_pm = raw
            setattr(self, "_barber_presencial_payment_method", presencial_pm)
        elif role == "admin":
            new_status = validated_data.get("status", instance.status)
            if new_status == Appointment.STATUS_EM_ANDAMENTO and validated_data.get("service_started_at") is None:
                validated_data["service_started_at"] = timezone.now()
            if new_status == Appointment.STATUS_CONCLUIDO:
                validated_data["service_started_at"] = None
        return super().update(instance, validated_data)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, min_length=8, write_only=True)
    new_password_confirm = serializers.CharField(required=True, min_length=8, write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "As senhas não coincidem."})
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True, allow_blank=False)
    token = serializers.CharField(required=True, allow_blank=False)
    new_password = serializers.CharField(required=True, min_length=8, write_only=True)
    new_password_confirm = serializers.CharField(required=True, min_length=8, write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "As senhas não coincidem."})
        return attrs


class BusinessHoursSerializer(serializers.ModelSerializer):
    weekday_label = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = BusinessHours
        fields = ["id", "weekday", "weekday_label", "open_time", "close_time", "is_open"]

    def validate(self, attrs):
        open_time = attrs.get("open_time", getattr(self.instance, "open_time", None))
        close_time = attrs.get("close_time", getattr(self.instance, "close_time", None))
        if open_time and close_time and close_time <= open_time:
            raise serializers.ValidationError({"close_time": "O horário de fechamento deve ser após o de abertura."})
        return attrs


class BlockedSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockedSlot
        fields = ["id", "barber_calendar_key", "date", "start_time", "end_time", "reason"]

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "O horário final deve ser maior que o inicial."})
        return attrs

    def validate_barber_calendar_key(self, value):
        return (value or "").strip().lower()


class BlockTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockTemplate
        fields = ["id", "name", "start_time", "end_time", "reason", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "O horário final deve ser maior que o inicial."})
        return attrs


class ClientPackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientPackage
        fields = [
            "id",
            "name",
            "description",
            "sessions",
            "sessions_unlimited",
            "price",
            "validity_days",
            "is_active",
        ]

    def validate(self, attrs):
        unlimited = attrs.get("sessions_unlimited")
        if unlimited is None and self.instance is not None:
            unlimited = self.instance.sessions_unlimited
        if unlimited is None:
            unlimited = False
        sessions = attrs.get("sessions")
        if sessions is None and self.instance is not None:
            sessions = self.instance.sessions
        if sessions is None:
            sessions = 1
        if not unlimited and int(sessions or 0) < 1:
            raise serializers.ValidationError({"sessions": "Informe pelo menos 1 sessão ou marque sessões ilimitadas."})
        return attrs


class ClientPackageSubscriptionSerializer(serializers.ModelSerializer):
    package = ClientPackageSerializer(read_only=True)
    package_id = serializers.IntegerField(write_only=True, required=False)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    expiry_notice_label = serializers.SerializerMethodField()

    class Meta:
        model = ClientPackageSubscription
        fields = [
            "id",
            "package",
            "package_id",
            "customer",
            "name",
            "email",
            "phone",
            "sessions_total",
            "sessions_used",
            "sessions_unlimited",
            "starts_at",
            "ends_at",
            "status",
            "status_display",
            "pending_login_notice",
            "login_notice_reason",
            "expiry_notice_label",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "customer",
            "sessions_total",
            "sessions_used",
            "sessions_unlimited",
            "starts_at",
            "ends_at",
            "created_at",
            "updated_at",
            "pending_login_notice",
            "login_notice_reason",
            "expiry_notice_label",
        ]

    def get_expiry_notice_label(self, obj):
        reason = (obj.login_notice_reason or "").strip()
        if getattr(obj, "pending_login_notice", False) and reason == "sessions_depleted":
            return "Sessões esgotadas"
        if getattr(obj, "status", None) != ClientPackageSubscription.STATUS_EXPIRED:
            return ""
        if reason == "plan_date_expired":
            return "Prazo do plano vencido"
        if reason == "sessions_depleted":
            return "Sessões esgotadas"
        return "Plano encerrado"

    def validate_email(self, value):
        return str(value or "").strip().lower()

    def validate(self, attrs):
        package_id = attrs.get("package_id")
        if self.instance is None:
            if not package_id:
                raise serializers.ValidationError({"package_id": "Informe o pacote para assinar."})
            package = ClientPackage.objects.filter(pk=package_id, is_active=True).first()
            if not package:
                raise serializers.ValidationError({"package_id": "Pacote inválido ou inativo."})
            request = self.context.get("request")
            user = getattr(request, "user", None)
            normalized_email = str(attrs.get("email") or "").strip().lower()
            active_statuses = [
                ClientPackageSubscription.STATUS_PENDING,
                ClientPackageSubscription.STATUS_ACTIVE,
            ]
            if user and getattr(user, "is_authenticated", False):
                already_has_plan = ClientPackageSubscription.objects.filter(
                    customer=user,
                    status__in=active_statuses,
                ).exists()
            else:
                already_has_plan = bool(normalized_email) and ClientPackageSubscription.objects.filter(
                    email__iexact=normalized_email,
                    status__in=active_statuses,
                ).exists()
            if already_has_plan:
                raise serializers.ValidationError(
                    {"detail": "Você já possui um plano ativo/pendente. Finalize ou cancele o atual antes de assinar outro."},
                )
            attrs["_package_obj"] = package
        return attrs

    def create(self, validated_data):
        package = validated_data.pop("_package_obj")
        validated_data.pop("package_id", None)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            validated_data["customer"] = user
            validated_data["email"] = user.email or validated_data["email"]
            validated_data["phone"] = user.phone or validated_data["phone"]
            validated_data["name"] = user.get_full_name() or user.username or validated_data["name"]
        validated_data["package"] = package
        unlimited = bool(getattr(package, "sessions_unlimited", False))
        validated_data["sessions_unlimited"] = unlimited
        validated_data["sessions_total"] = max(1, int(package.sessions or 1))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        previous_status = instance.status
        updated_instance = super().update(instance, validated_data)
        new_status = updated_instance.status
        if (
            new_status == ClientPackageSubscription.STATUS_ACTIVE
            and previous_status != ClientPackageSubscription.STATUS_ACTIVE
        ):
            today = timezone.localdate()
            validity_days = max(1, int(updated_instance.package.validity_days or 1))
            pkg = updated_instance.package
            unlimited = bool(getattr(pkg, "sessions_unlimited", False))
            updated_instance.starts_at = today
            updated_instance.ends_at = today + timedelta(days=validity_days - 1)
            updated_instance.sessions_unlimited = unlimited
            updated_instance.sessions_total = max(1, int(pkg.sessions or 1))
            updated_instance.sessions_used = 0
            updated_instance.save(
                update_fields=[
                    "starts_at",
                    "ends_at",
                    "sessions_unlimited",
                    "sessions_total",
                    "sessions_used",
                    "updated_at",
                ],
            )
        return updated_instance


class PortfolioCategoryWriteSerializer(serializers.Serializer):
    id = serializers.RegexField(r"^[a-z0-9_-]{1,40}$")
    label = serializers.CharField(max_length=80)
    order = serializers.IntegerField(required=False, default=0)

    def validate_id(self, value):
        if value == "todos":
            raise serializers.ValidationError(
                'O identificador "todos" é reservado para o filtro do site.'
            )
        return value


class PortfolioItemWriteSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=80)
    url = serializers.URLField(max_length=2048)
    title = serializers.CharField(max_length=160)
    categoryId = serializers.CharField(max_length=40)
    order = serializers.IntegerField(required=False, default=0)


class PortfolioSiteConfigWriteSerializer(serializers.Serializer):
    categories = serializers.ListField(
        child=PortfolioCategoryWriteSerializer(),
        min_length=1,
        max_length=24,
    )
    items = serializers.ListField(
        child=PortfolioItemWriteSerializer(),
        max_length=80,
    )

    def validate(self, attrs):
        cats = attrs["categories"]
        cat_ids = [c["id"] for c in cats]
        if len(set(cat_ids)) != len(cat_ids):
            raise serializers.ValidationError({"categories": "IDs de categorias devem ser únicos."})
        cat_set = set(cat_ids)
        for it in attrs["items"]:
            if it["categoryId"] not in cat_set:
                raise serializers.ValidationError(
                    {
                        "items": (
                            f'O item "{it["id"]}" referencia a categoria '
                            f'"{it["categoryId"]}", que não existe na lista.'
                        )
                    }
                )
        return attrs
