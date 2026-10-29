import hashlib
import hmac
import json
from decimal import Decimal
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings
from rest_framework import generics, permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from datetime import datetime, timedelta
from api.booking_slots import SERVICE_PRICES
from api.models import Appointment
from services.models import Service
from barbers.models import Barber
from .models import (
    NotificationEvent,
    PaymentTransaction,
    SaaSPlan,
    ServiceUsageCost,
    SiteSubscription,
    UsageTracking,
    UserBilling,
)
from .serializers import (
    NotificationEventSerializer,
    PaymentTransactionSerializer,
    SaaSPlanSerializer,
    ServiceUsageCostSerializer,
    SiteSubscriptionSerializer,
    UsageTrackingSerializer,
    UserBillingSerializer,
)
from .utils import get_or_create_site_subscription
from api.notifications import send_profile_email, send_whatsapp_text


class UserBillingViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet para visualizar faturas do usuário"""
    serializer_class = UserBillingSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return UserBilling.objects.all()
        return user.billing_history.all()
    
    @action(detail=False, methods=["get"])
    def current_month(self, request):
        """Retorna fatura do mês atual"""
        today = timezone.now().date()
        current_month = today.replace(day=1)
        
        billing, created = UserBilling.objects.get_or_create(
            user=request.user,
            month=current_month
        )
        
        if created:
            billing = UserBilling.calculate_and_create_billing(request.user, current_month)
        
        serializer = self.get_serializer(billing)
        return Response(serializer.data)
    
    @action(detail=False, methods=["post"])
    def generate_monthly_billing(self, request):
        """Gera fatura do mês especificado (admin only)"""
        if not request.user.is_staff:
            return Response(
                {"detail": "Permissão negada"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        month_str = request.data.get("month")  # YYYY-MM-DD
        user_id = request.data.get("user_id")
        
        if not month_str or not user_id:
            return Response(
                {"detail": "month e user_id são obrigatórios"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            month_date = datetime.strptime(month_str, "%Y-%m-%d").date()
            from django.contrib.auth import get_user_model
            User = get_user_model()
            user = User.objects.get(id=user_id)
        except (ValueError, User.DoesNotExist) as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        billing, created = UserBilling.calculate_and_create_billing(user, month_date)
        serializer = self.get_serializer(billing)
        return Response(serializer.data)


class ServiceUsageCostViewSet(viewsets.ModelViewSet):
    """ViewSet para gerenciar custos de uso (admin only)"""
    queryset = ServiceUsageCost.objects.all()
    serializer_class = ServiceUsageCostSerializer
    permission_classes = [permissions.IsAdminUser]


class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """Auditoria de pagamentos (admin visualiza tudo)."""

    serializer_class = PaymentTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "role", None) == "admin" or user.is_staff:
            return PaymentTransaction.objects.select_related("appointment").all()
        return PaymentTransaction.objects.none()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        keys = set()
        for tx in queryset:
            ap = getattr(tx, "appointment", None)
            if ap:
                k = (ap.barber or "").strip()
                if k:
                    keys.add(k)
        barber_map = {}
        if keys:
            for b in Barber.objects.filter(calendar_key__in=keys).select_related("user"):
                barber_map[b.calendar_key] = (b.user.get_full_name() or b.user.username or b.calendar_key).strip()
        serializer = self.get_serializer(
            queryset,
            many=True,
            context={**self.get_serializer_context(), "barber_display_map": barber_map},
        )
        return Response(serializer.data)


class NotificationEventViewSet(viewsets.ReadOnlyModelViewSet):
    """Auditoria operacional de notificações."""

    serializer_class = NotificationEventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "role", None) == "admin" or user.is_staff:
            return NotificationEvent.objects.select_related("appointment").all()
        return NotificationEvent.objects.none()


class SaaSPlanViewSet(viewsets.ModelViewSet):
    """Planos SaaS: leitura pública e gestão pelo admin."""

    serializer_class = SaaSPlanSerializer

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        queryset = SaaSPlan.objects.all().order_by("monthly_price")
        user = self.request.user
        if getattr(user, "is_authenticated", False) and (
            getattr(user, "role", None) == "admin" or getattr(user, "is_staff", False)
        ):
            return queryset
        return queryset.filter(is_active=True)

    def _is_admin_user(self):
        user = self.request.user
        return getattr(user, "role", None) == "admin" or getattr(user, "is_staff", False)

    def create(self, request, *args, **kwargs):
        if not self._is_admin_user():
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not self._is_admin_user():
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not self._is_admin_user():
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self._is_admin_user():
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class SiteSubscriptionView(APIView):
    """Gerencia assinatura global da barbearia (single-tenant)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        subscription = get_or_create_site_subscription()
        serializer = SiteSubscriptionSerializer(subscription)
        return Response(serializer.data)

    def patch(self, request):
        if getattr(request.user, "role", None) != "admin":
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        subscription = get_or_create_site_subscription()
        serializer = SiteSubscriptionSerializer(subscription, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SiteSubscriptionActivateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if getattr(request.user, "role", None) != "admin":
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        plan_slug = str(request.data.get("plan_slug", "")).strip()
        billing_cycle = str(request.data.get("billing_cycle", SiteSubscription.BILLING_MONTHLY)).strip().lower()
        if billing_cycle not in {SiteSubscription.BILLING_MONTHLY, SiteSubscription.BILLING_YEARLY}:
            return Response({"detail": "billing_cycle inválido."}, status=status.HTTP_400_BAD_REQUEST)

        plan = SaaSPlan.objects.filter(slug=plan_slug, is_active=True).first()
        if not plan:
            return Response({"detail": "Plano não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        subscription = get_or_create_site_subscription()
        now = timezone.now()
        period_end = now + (timedelta(days=30) if billing_cycle == SiteSubscription.BILLING_MONTHLY else timedelta(days=365))
        subscription.plan = plan
        subscription.status = SiteSubscription.STATUS_ACTIVE
        subscription.billing_cycle = billing_cycle
        subscription.current_period_end = period_end
        subscription.last_payment_at = now
        subscription.save(
            update_fields=[
                "plan",
                "status",
                "billing_cycle",
                "current_period_end",
                "last_payment_at",
                "updated_at",
            ],
        )
        return Response(SiteSubscriptionSerializer(subscription).data)


class SiteSubscriptionMarkOverdueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if getattr(request.user, "role", None) != "admin":
            return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        subscription = get_or_create_site_subscription()
        subscription.status = SiteSubscription.STATUS_PAST_DUE
        if not subscription.current_period_end:
            subscription.current_period_end = timezone.now()
        subscription.save(update_fields=["status", "current_period_end", "updated_at"])
        return Response(SiteSubscriptionSerializer(subscription).data)


class MercadoPagoCheckoutView(APIView):
    """Cria checkout do Mercado Pago para um agendamento do proprio cliente."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "checkout"

    def post(self, request):
        if getattr(settings, "DEMO_MODE", False):
            return Response(
                {"detail": "Pagamentos desativados no modo demonstracao."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        access_token = str(getattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "")).strip()
        if not access_token:
            return Response(
                {"detail": "MERCADO_PAGO_ACCESS_TOKEN não configurado no backend."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        appointment_id = request.data.get("appointment_id")
        if not appointment_id:
            return Response({"detail": "appointment_id é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            appointment = Appointment.objects.get(pk=appointment_id)
        except Appointment.DoesNotExist:
            return Response({"detail": "Agendamento não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_owner = appointment.customer_id == user.id or (
            appointment.customer_id is None
            and (appointment.email or "").strip().lower() == (user.email or "").strip().lower()
        )
        if getattr(user, "role", None) != "admin" and not is_owner:
            return Response(
                {"detail": "Agendamento nao encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        amount = (
            Service.objects.filter(
                is_active=True, name=appointment.get_service_display()
            )
            .values_list("price", flat=True)
            .first()
        )
        if amount is None:
            amount = SERVICE_PRICES.get(appointment.service)
        if amount is None:
            return Response(
                {"detail": "Servico sem preco configurado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        external_reference = f"appointment:{appointment.id}"
        frontend_url = str(getattr(settings, "FRONTEND_URL", "http://localhost:5173")).rstrip("/")
        backend_base = str(getattr(settings, "BACKEND_PUBLIC_URL", "http://127.0.0.1:8000")).rstrip("/")

        payload = {
            "items": [
                {
                    "title": f"Agendamento Barbearia Demo - {appointment.get_service_display()}",
                    "quantity": 1,
                    "currency_id": "BRL",
                    "unit_price": float(amount),
                }
            ],
            "payer": {
                "email": appointment.email or "",
                "name": appointment.name or "",
            },
            "external_reference": external_reference,
            "notification_url": f"{backend_base}/api/payments/mercado-pago/webhook/",
            "back_urls": {
                "success": f"{frontend_url}/minha-conta",
                "pending": f"{frontend_url}/minha-conta",
                "failure": f"{frontend_url}/minha-conta",
            },
            "auto_return": "approved",
        }

        req = urllib_request.Request(
            url="https://api.mercadopago.com/checkout/preferences",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=20) as response:
                response_data = json.loads(response.read().decode("utf-8"))
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return Response(
                {"detail": "Falha ao criar checkout no Mercado Pago.", "provider_error": detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            return Response(
                {"detail": f"Erro ao conectar com Mercado Pago: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        preference_id = str(response_data.get("id", "")).strip()
        checkout_url = str(response_data.get("init_point") or response_data.get("sandbox_init_point") or "").strip()
        if not preference_id or not checkout_url:
            return Response(
                {"detail": "Resposta inválida do Mercado Pago ao criar checkout."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        PaymentTransaction.objects.update_or_create(
            appointment=appointment,
            external_reference=external_reference,
            defaults={
                "provider": PaymentTransaction.PROVIDER_MERCADO_PAGO,
                "preference_id": preference_id,
                "checkout_url": checkout_url,
                "amount": amount,
                "status": PaymentTransaction.STATUS_PENDING,
                "raw_payload": response_data,
            },
        )

        return Response(
            {
                "checkout_url": checkout_url,
                "preference_id": preference_id,
                "external_reference": external_reference,
            },
            status=status.HTTP_201_CREATED,
        )


class MercadoPagoWebhookView(APIView):
    """Webhook do Mercado Pago com validacao de assinatura HMAC."""

    permission_classes = [permissions.AllowAny]

    PAYMENT_STATUS_MAP = {
        "approved": PaymentTransaction.STATUS_APPROVED,
        "in_process": PaymentTransaction.STATUS_PENDING,
        "pending": PaymentTransaction.STATUS_PENDING,
        "rejected": PaymentTransaction.STATUS_REJECTED,
        "cancelled": PaymentTransaction.STATUS_CANCELLED,
        "refunded": PaymentTransaction.STATUS_REFUNDED,
        "charged_back": PaymentTransaction.STATUS_REFUNDED,
    }

    def post(self, request):
        if getattr(settings, "DEMO_MODE", False):
            return Response(
                {"detail": "Webhook desativado no modo demonstracao."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        secret = str(getattr(settings, "MERCADO_PAGO_WEBHOOK_SECRET", "")).strip()
        if not secret:
            return Response(
                {"detail": "MERCADO_PAGO_WEBHOOK_SECRET nao configurado."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        signature = str(request.headers.get("x-signature", ""))
        request_id = str(request.headers.get("x-request-id", ""))
        ts_part = ""
        v1_part = ""
        for part in signature.split(","):
            key, _, value = part.strip().partition("=")
            if key == "ts":
                ts_part = value
            elif key == "v1":
                v1_part = value
        data = request.data if isinstance(request.data, dict) else {}
        payment_id = data.get("data", {}).get("id") or data.get("id")
        if not ts_part or not v1_part or not payment_id:
            return Response(
                {"detail": "Assinatura ausente ou invalida."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        manifest = f"id:{str(payment_id).lower()};request-id:{request_id};ts:{ts_part};"
        expected = hmac.new(
            secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, v1_part):
            return Response(
                {"detail": "Assinatura invalida."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        data = request.data if isinstance(request.data, dict) else {}
        payment_id = data.get("data", {}).get("id") or data.get("id")
        topic = data.get("type") or data.get("topic")
        if not payment_id or (topic and topic != "payment"):
            return Response({"detail": "Webhook ignorado."}, status=status.HTTP_200_OK)

        access_token = str(getattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "")).strip()
        if not access_token:
            return Response({"detail": "Token do Mercado Pago ausente."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        req = urllib_request.Request(
            url=f"https://api.mercadopago.com/v1/payments/{payment_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )
        try:
            with urllib_request.urlopen(req, timeout=20) as response:
                payment_data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return Response({"detail": "Não foi possível consultar pagamento."}, status=status.HTTP_200_OK)

        external_reference = str(payment_data.get("external_reference", "")).strip()
        status_from_provider = str(payment_data.get("status", "")).strip().lower()
        mapped_status = self.PAYMENT_STATUS_MAP.get(status_from_provider, PaymentTransaction.STATUS_PENDING)
        amount = Decimal(str(payment_data.get("transaction_amount", "0") or "0"))

        if not external_reference.startswith("appointment:"):
            return Response({"detail": "external_reference inválido."}, status=status.HTTP_200_OK)

        appointment_id = external_reference.split(":", 1)[1]
        try:
            appointment = Appointment.objects.get(pk=appointment_id)
        except Appointment.DoesNotExist:
            return Response({"detail": "Agendamento não encontrado."}, status=status.HTTP_200_OK)

        transaction, _ = PaymentTransaction.objects.get_or_create(
            appointment=appointment,
            external_reference=external_reference,
            defaults={"provider": PaymentTransaction.PROVIDER_MERCADO_PAGO},
        )
        transaction.payment_id = str(payment_data.get("id", "")).strip()
        transaction.preference_id = str(payment_data.get("order", {}).get("id", "")).strip() or transaction.preference_id
        transaction.amount = amount
        transaction.status = mapped_status
        transaction.raw_payload = payment_data
        transaction.save(update_fields=["payment_id", "preference_id", "amount", "status", "raw_payload", "updated_at"])

        if mapped_status == PaymentTransaction.STATUS_APPROVED and appointment.status == Appointment.STATUS_PENDING:
            appointment.status = Appointment.STATUS_CONFIRMED
            appointment.save(update_fields=["status", "updated_at"])
            send_whatsapp_text(
                appointment.phone,
                (
                    "Barbearia Demo: pagamento aprovado! "
                    f"Seu horário de {appointment.date.strftime('%d/%m/%Y')} às "
                    f"{appointment.time.strftime('%H:%M')} está confirmado."
                ),
                event_type="payment_approved",
                appointment=appointment,
            )
            recipient_email = (
                (getattr(appointment.customer, "email", "") if appointment.customer else "")
                or appointment.email
            )
            send_profile_email(
                recipient_email,
                "Pagamento aprovado - Barbearia Demo",
                (
                    "Pagamento confirmado com sucesso.\n\n"
                    f"Serviço: {appointment.get_service_display()}\n"
                    f"Data: {appointment.date.strftime('%d/%m/%Y')}\n"
                    f"Horário: {appointment.time.strftime('%H:%M')}\n\n"
                    "Seu horário está confirmado. Te esperamos!"
                ),
                event_type="payment_approved_email",
                appointment=appointment,
            )

        return Response({"detail": "Webhook processado."}, status=status.HTTP_200_OK)
