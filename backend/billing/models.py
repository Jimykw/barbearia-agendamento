from django.db import models
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import datetime, timedelta

User = get_user_model()


class UsageTracking(models.Model):
    """Rastreia ações dos usuários para cálculo de gastos"""
    
    ACTION_LOGIN = "login"
    ACTION_APPOINTMENT_CREATE = "appointment_create"
    ACTION_APPOINTMENT_VIEW = "appointment_view"
    ACTION_DASHBOARD_ACCESS = "dashboard_access"
    ACTION_PROFILE_UPDATE = "profile_update"
    ACTION_EXPORT_DATA = "export_data"
    
    ACTION_CHOICES = [
        (ACTION_LOGIN, "Login"),
        (ACTION_APPOINTMENT_CREATE, "Criar Agendamento"),
        (ACTION_APPOINTMENT_VIEW, "Visualizar Agendamento"),
        (ACTION_DASHBOARD_ACCESS, "Acessar Dashboard"),
        (ACTION_PROFILE_UPDATE, "Atualizar Perfil"),
        (ACTION_EXPORT_DATA, "Exportar Dados"),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="usage_tracking")
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Rastreamento de Uso"
        verbose_name_plural = "Rastreamentos de Uso"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.get_action_display()} - {self.created_at}"


class ServiceUsageCost(models.Model):
    """Preço de uso por ação"""
    
    action = models.CharField(max_length=50, choices=UsageTracking.ACTION_CHOICES, unique=True)
    cost_per_action = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Custo de Uso de Serviço"
        verbose_name_plural = "Custos de Uso de Serviço"
    
    def __str__(self):
        return f"{self.get_action_display()} - R$ {self.cost_per_action}"


class UserBilling(models.Model):
    """Fatura mensal do usuário"""
    
    STATUS_OPEN = "open"
    STATUS_PAID = "paid"
    STATUS_OVERDUE = "overdue"
    
    STATUS_CHOICES = [
        (STATUS_OPEN, "Aberto"),
        (STATUS_PAID, "Pago"),
        (STATUS_OVERDUE, "Vencido"),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="billing_history")
    month = models.DateField()  # Primeiro dia do mês
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    usage_details = models.JSONField(default=dict)  # {action: count, ...}
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Fatura do Usuário"
        verbose_name_plural = "Faturas do Usuário"
        unique_together = ["user", "month"]
        ordering = ["-month"]
    
    def __str__(self):
        return f"{self.user.username} - {self.month.strftime('%m/%Y')} - R$ {self.total_cost}"
    
    @classmethod
    def calculate_and_create_billing(cls, user, month_date):
        """Calcula e cria billing para um usuário em um mês específico"""
        first_day = month_date.replace(day=1)
        last_day = (first_day + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        # Contar ações por tipo
        usage_details = {}
        total_cost = Decimal("0.00")
        
        for action_code, action_name in UsageTracking.ACTION_CHOICES:
            count = UsageTracking.objects.filter(
                user=user,
                action=action_code,
                created_at__date__range=[first_day, last_day]
            ).count()
            
            if count > 0:
                try:
                    cost = ServiceUsageCost.objects.get(action=action_code, is_active=True)
                    action_total = Decimal(str(count)) * cost.cost_per_action
                    usage_details[action_code] = {
                        "count": count,
                        "cost_per_action": str(cost.cost_per_action),
                        "total": str(action_total)
                    }
                    total_cost += action_total
                except ServiceUsageCost.DoesNotExist:
                    pass
        
        billing, created = cls.objects.update_or_create(
            user=user,
            month=first_day,
            defaults={
                "total_cost": total_cost,
                "usage_details": usage_details,
                "due_date": last_day + timedelta(days=5),
            }
        )
        return billing, created


class AppointmentCost(models.Model):
    """Rastreia custos específicos de cada agendamento"""
    
    appointment = models.OneToOneField(
        'api.Appointment',
        on_delete=models.CASCADE,
        related_name="cost"
    )
    service_price = models.DecimalField(max_digits=10, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    discount_applied = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    total_cost = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Custo de Agendamento"
        verbose_name_plural = "Custos de Agendamento"
    
    def __str__(self):
        return f"{self.appointment} - R$ {self.total_cost}"


class PaymentTransaction(models.Model):
    """Transação de pagamento vinculada ao agendamento."""

    PROVIDER_MERCADO_PAGO = "mercado_pago"
    PROVIDER_DINHEIRO = "dinheiro"
    PROVIDER_PIX = "pix"
    PROVIDER_PACOTE = "pacote"
    PROVIDER_CHOICES = [
        (PROVIDER_MERCADO_PAGO, "Mercado Pago"),
        (PROVIDER_DINHEIRO, "Dinheiro (balcão)"),
        (PROVIDER_PIX, "Pix (balcão)"),
        (PROVIDER_PACOTE, "Pacote"),
    ]

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUS_REFUNDED = "refunded"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendente"),
        (STATUS_APPROVED, "Aprovado"),
        (STATUS_REJECTED, "Recusado"),
        (STATUS_CANCELLED, "Cancelado"),
        (STATUS_REFUNDED, "Estornado"),
    ]

    appointment = models.ForeignKey(
        "api.Appointment",
        on_delete=models.CASCADE,
        related_name="payment_transactions",
    )
    provider = models.CharField(max_length=30, choices=PROVIDER_CHOICES, default=PROVIDER_MERCADO_PAGO)
    external_reference = models.CharField(max_length=100, db_index=True)
    preference_id = models.CharField(max_length=120, blank=True, default="")
    payment_id = models.CharField(max_length=120, blank=True, default="")
    checkout_url = models.URLField(blank=True, default="")
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Transação de pagamento"
        verbose_name_plural = "Transações de pagamento"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["provider", "external_reference"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.get_provider_display()} #{self.external_reference} ({self.status})"


class SaaSPlan(models.Model):
    """Planos comerciais do sistema."""

    slug = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    max_barbers = models.PositiveIntegerField(default=2)
    max_monthly_appointments = models.PositiveIntegerField(default=200)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Plano SaaS"
        verbose_name_plural = "Planos SaaS"
        ordering = ["monthly_price", "name"]

    def __str__(self):
        return f"{self.name} (R$ {self.monthly_price}/mês)"


class SiteSubscription(models.Model):
    """Assinatura única da barbearia (single-tenant)."""

    STATUS_TRIAL = "trial"
    STATUS_ACTIVE = "active"
    STATUS_PAST_DUE = "past_due"
    STATUS_CANCELED = "canceled"
    STATUS_CHOICES = [
        (STATUS_TRIAL, "Período de teste"),
        (STATUS_ACTIVE, "Ativa"),
        (STATUS_PAST_DUE, "Inadimplente"),
        (STATUS_CANCELED, "Cancelada"),
    ]

    BILLING_MONTHLY = "monthly"
    BILLING_YEARLY = "yearly"
    BILLING_CHOICES = [
        (BILLING_MONTHLY, "Mensal"),
        (BILLING_YEARLY, "Anual"),
    ]

    plan = models.ForeignKey(
        SaaSPlan,
        on_delete=models.SET_NULL,
        related_name="subscriptions",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_TRIAL)
    billing_cycle = models.CharField(max_length=12, choices=BILLING_CHOICES, default=BILLING_MONTHLY)
    started_at = models.DateTimeField(auto_now_add=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    last_payment_at = models.DateTimeField(null=True, blank=True)
    grace_days = models.PositiveIntegerField(default=3)
    auto_renew = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Assinatura do site"
        verbose_name_plural = "Assinaturas do site"

    def __str__(self):
        plan = self.plan.name if self.plan else "Sem plano"
        return f"{plan} - {self.get_status_display()}"


class NotificationEvent(models.Model):
    """Logs de notificações operacionais (WhatsApp/e-mail)."""

    CHANNEL_WHATSAPP = "whatsapp"
    CHANNEL_EMAIL = "email"
    CHANNEL_CHOICES = [
        (CHANNEL_WHATSAPP, "WhatsApp"),
        (CHANNEL_EMAIL, "E-mail"),
    ]

    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_SKIPPED = "skipped"
    STATUS_CHOICES = [
        (STATUS_SENT, "Enviado"),
        (STATUS_FAILED, "Falhou"),
        (STATUS_SKIPPED, "Ignorado"),
    ]

    appointment = models.ForeignKey(
        "api.Appointment",
        on_delete=models.SET_NULL,
        related_name="notification_events",
        null=True,
        blank=True,
    )
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default=CHANNEL_WHATSAPP)
    event_type = models.CharField(max_length=80, default="generic")
    recipient = models.CharField(max_length=255, blank=True, default="")
    message = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SENT)
    provider_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Evento de notificação"
        verbose_name_plural = "Eventos de notificação"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["channel", "status", "-created_at"]),
            models.Index(fields=["event_type", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.get_channel_display()} {self.event_type} ({self.status})"
