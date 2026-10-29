from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q

User = get_user_model()


class Appointment(models.Model):
    SERVICE_CORTE = "corte"
    SERVICE_BARBA = "barba"
    SERVICE_COMPLETO = "completo"
    SERVICE_PLATINADO = "platinado"
    SERVICE_PIGMENTACAO = "pigmentacao"

    SERVICE_CHOICES = [
        (SERVICE_CORTE, "Corte"),
        (SERVICE_BARBA, "Barba"),
        (SERVICE_COMPLETO, "Corte + Barba"),
        (SERVICE_PLATINADO, "Platinado"),
        (SERVICE_PIGMENTACAO, "Pigmentação"),
    ]

    BARBER_BARBEIRO_ONE = "barbeiro1"
    BARBER_BARBEIRO_TWO = "barbeiro2"

    BARBER_CHOICES = [
        (BARBER_BARBEIRO_ONE, "Barbeiro 1"),
        (BARBER_BARBEIRO_TWO, "Barbeiro 2"),
    ]

    STATUS_PENDING = "pendente"
    STATUS_CONFIRMED = "confirmado"
    STATUS_CANCELED = "cancelado"
    STATUS_EM_ANDAMENTO = "em_atendimento"
    STATUS_CONCLUIDO = "concluido"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendente"),
        (STATUS_CONFIRMED, "Confirmado"),
        (STATUS_EM_ANDAMENTO, "Em atendimento"),
        (STATUS_CONCLUIDO, "Concluído"),
        (STATUS_CANCELED, "Cancelado"),
    ]

    customer = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="appointments",
    )
    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    service = models.CharField(max_length=50, choices=SERVICE_CHOICES)
    barber = models.CharField(max_length=50, choices=BARBER_CHOICES)
    date = models.DateField()
    time = models.TimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    package_subscription = models.ForeignKey(
        "ClientPackageSubscription",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consumed_appointments",
    )
    closing_payment_method = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Como o atendimento foi quitado ao concluir: dinheiro, pix ou pacote.",
    )
    service_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # Só bloqueia slot para agendamentos ainda ativos; concluído/cancelado liberam o horário
            # (novo cliente ou reagendamento no mesmo dia/hora após atendimento encerrado).
            models.UniqueConstraint(
                fields=["barber", "date", "time"],
                condition=Q(
                    status__in=[
                        "pendente",
                        "confirmado",
                        "em_atendimento",
                    ]
                ),
                name="unique_active_slot_per_barber",
            )
        ]

    def __str__(self):
        return f"{self.name} - {self.service} - {self.date} {self.time}"


class BusinessHours(models.Model):
    WEEKDAYS = [
        (0, "Segunda"),
        (1, "Terça"),
        (2, "Quarta"),
        (3, "Quinta"),
        (4, "Sexta"),
        (5, "Sábado"),
        (6, "Domingo"),
    ]

    weekday = models.IntegerField(choices=WEEKDAYS, unique=True)
    open_time = models.TimeField()
    close_time = models.TimeField()
    is_open = models.BooleanField(default=True)

    class Meta:
        ordering = ["weekday"]
        verbose_name = "Horário de funcionamento"
        verbose_name_plural = "Horários de funcionamento"

    def __str__(self):
        return f"{self.get_weekday_display()} ({self.open_time} - {self.close_time})"


class BlockedSlot(models.Model):
    barber_calendar_key = models.CharField(max_length=50, blank=True, default="")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["date", "start_time"]
        verbose_name = "Bloqueio de agenda"
        verbose_name_plural = "Bloqueios de agenda"

    def __str__(self):
        scope = self.barber_calendar_key or "Todos barbeiros"
        return f"{scope} - {self.date} {self.start_time}-{self.end_time}"


class BlockTemplate(models.Model):
    name = models.CharField(max_length=80, unique=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    reason = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Template de bloqueio"
        verbose_name_plural = "Templates de bloqueio"

    def __str__(self):
        return f"{self.name} ({self.start_time}-{self.end_time})"


class ClientPackage(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    sessions = models.PositiveIntegerField(default=1)
    sessions_unlimited = models.BooleanField(
        default=False,
        help_text="Se verdadeiro, o pacote oferece sessões ilimitadas dentro da vigência.",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    validity_days = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["price", "name"]
        verbose_name = "Pacote para cliente"
        verbose_name_plural = "Pacotes para clientes"

    def __str__(self):
        if getattr(self, "sessions_unlimited", False):
            return f"{self.name} (sessões ilimitadas)"
        return f"{self.name} ({self.sessions} sessões)"


class ClientPackageSubscription(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_CANCELED = "canceled"
    STATUS_EXPIRED = "expired"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendente"),
        (STATUS_ACTIVE, "Ativo"),
        (STATUS_CANCELED, "Cancelado"),
        (STATUS_EXPIRED, "Expirado"),
    ]

    package = models.ForeignKey(ClientPackage, on_delete=models.PROTECT, related_name="subscriptions")
    customer = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="package_subscriptions",
    )
    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    sessions_total = models.PositiveIntegerField(default=1)
    sessions_used = models.PositiveIntegerField(default=0)
    sessions_unlimited = models.BooleanField(
        default=False,
        help_text="Se verdadeiro, não há limite de sessões até o fim da vigência.",
    )
    starts_at = models.DateField(null=True, blank=True)
    ends_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    notes = models.TextField(blank=True)
    pending_login_notice = models.BooleanField(
        default=False,
        help_text="Cliente ainda não viu o aviso de plano/sessões encerrados no próximo login.",
    )
    login_notice_reason = models.CharField(
        max_length=40,
        blank=True,
        default="",
        help_text="sessions_depleted | plan_date_expired",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Assinatura de pacote"
        verbose_name_plural = "Assinaturas de pacotes"
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["email", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.package.name} ({self.get_status_display()})"


class PortfolioSiteConfig(models.Model):
    """Configuração única do portfólio público (categorias e itens)."""

    categories = models.JSONField(default=list, blank=True)
    items = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Portfólio do site"
        verbose_name_plural = "Portfólio do site"

    def __str__(self):
        return "Portfólio do site"
