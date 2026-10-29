import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0004_alter_appointment_barber_keys"),
        ("billing", "0004_rename_billing_paym_provider_35229f_idx_billing_pay_provide_489b30_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("channel", models.CharField(choices=[("whatsapp", "WhatsApp"), ("email", "E-mail")], default="whatsapp", max_length=20)),
                ("event_type", models.CharField(default="generic", max_length=80)),
                ("recipient", models.CharField(blank=True, default="", max_length=64)),
                ("message", models.TextField(blank=True, default="")),
                ("status", models.CharField(choices=[("sent", "Enviado"), ("failed", "Falhou"), ("skipped", "Ignorado")], default="sent", max_length=20)),
                ("provider_response", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "appointment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="notification_events",
                        to="api.appointment",
                    ),
                ),
            ],
            options={
                "verbose_name": "Evento de notificação",
                "verbose_name_plural": "Eventos de notificação",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["channel", "status", "-created_at"], name="billing_not_channel_d4e09a_idx"),
                    models.Index(fields=["event_type", "-created_at"], name="billing_not_event_t_6f2f75_idx"),
                ],
            },
        ),
    ]
