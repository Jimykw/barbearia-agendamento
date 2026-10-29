from django.db import models
from django.core.exceptions import ValidationError
from accounts.models import User


class Barber(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="barber_profile")
    calendar_key = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Chave do barbeiro nos agendamentos (ex.: barbeiro1, barbeiro2). Deve coincidir com Appointment.barber.",
    )
    bio = models.TextField(blank=True)
    specialties = models.CharField(max_length=255, blank=True, help_text="Separar por vírgula: corte clássico, degradê, etc.")
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    total_appointments = models.IntegerField(default=0)
    is_available = models.BooleanField(default=True)
    hired_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Momento em que esta conta passou a atuar como barbeiro (última promoção).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Barbeiro"
        verbose_name_plural = "Barbeiros"

    def __str__(self):
        return self.user.get_full_name() or self.user.username

    def save(self, *args, **kwargs):
        if self.user.role != User.ROLE_BARBEIRO:
            self.user.role = User.ROLE_BARBEIRO
            self.user.save()
        super().save(*args, **kwargs)


class BarberAvailability(models.Model):
    DAYS_OF_WEEK = [
        (0, "Segunda"),
        (1, "Terça"),
        (2, "Quarta"),
        (3, "Quinta"),
        (4, "Sexta"),
        (5, "Sábado"),
        (6, "Domingo"),
    ]

    barber = models.ForeignKey(Barber, on_delete=models.CASCADE, related_name="availability")
    day_of_week = models.IntegerField(choices=DAYS_OF_WEEK)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_available = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Disponibilidade Barbeiro"
        verbose_name_plural = "Disponibilidades Barbeiros"
        unique_together = ["barber", "day_of_week"]

    def clean(self):
        if self.start_time >= self.end_time:
            raise ValidationError("Horário de início deve ser antes do horário de fim.")

    def __str__(self):
        return f"{self.barber} - {self.get_day_of_week_display()}"
