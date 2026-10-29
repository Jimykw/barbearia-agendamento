from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0004_alter_appointment_barber_keys"),
        ("billing", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(choices=[("mercado_pago", "Mercado Pago")], default="mercado_pago", max_length=30)),
                ("external_reference", models.CharField(db_index=True, max_length=100)),
                ("preference_id", models.CharField(blank=True, default="", max_length=120)),
                ("payment_id", models.CharField(blank=True, default="", max_length=120)),
                ("checkout_url", models.URLField(blank=True, default="")),
                ("amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("status", models.CharField(choices=[("pending", "Pendente"), ("approved", "Aprovado"), ("rejected", "Recusado"), ("cancelled", "Cancelado"), ("refunded", "Estornado")], default="pending", max_length=20)),
                ("raw_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "appointment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_transactions",
                        to="api.appointment",
                    ),
                ),
            ],
            options={
                "verbose_name": "Transação de pagamento",
                "verbose_name_plural": "Transações de pagamento",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["provider", "external_reference"], name="billing_paym_provider_35229f_idx"),
                    models.Index(fields=["status", "-created_at"], name="billing_paym_status_4474ac_idx"),
                ],
            },
        ),
    ]
