from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


def seed_default_plans(apps, schema_editor):
    SaaSPlan = apps.get_model("billing", "SaaSPlan")
    defaults = [
        {
            "slug": "basico",
            "name": "Básico",
            "monthly_price": Decimal("79.90"),
            "yearly_price": Decimal("799.00"),
            "max_barbers": 2,
            "max_monthly_appointments": 250,
            "features": ["Agenda online", "Confirmação por e-mail", "Painel básico"],
        },
        {
            "slug": "pro",
            "name": "Pro",
            "monthly_price": Decimal("149.90"),
            "yearly_price": Decimal("1499.00"),
            "max_barbers": 6,
            "max_monthly_appointments": 1200,
            "features": ["Tudo do Básico", "Relatórios avançados", "Checkout online"],
        },
        {
            "slug": "premium",
            "name": "Premium",
            "monthly_price": Decimal("249.90"),
            "yearly_price": Decimal("2499.00"),
            "max_barbers": 20,
            "max_monthly_appointments": 9999,
            "features": ["Tudo do Pro", "Suporte prioritário", "Integrações avançadas"],
        },
    ]
    for plan_data in defaults:
        SaaSPlan.objects.update_or_create(slug=plan_data["slug"], defaults=plan_data)


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0002_paymenttransaction"),
    ]

    operations = [
        migrations.CreateModel(
            name="SaaSPlan",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=40, unique=True)),
                ("name", models.CharField(max_length=80)),
                ("monthly_price", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("yearly_price", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("max_barbers", models.PositiveIntegerField(default=2)),
                ("max_monthly_appointments", models.PositiveIntegerField(default=200)),
                ("features", models.JSONField(blank=True, default=list)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Plano SaaS",
                "verbose_name_plural": "Planos SaaS",
                "ordering": ["monthly_price", "name"],
            },
        ),
        migrations.CreateModel(
            name="SiteSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("trial", "Período de teste"), ("active", "Ativa"), ("past_due", "Inadimplente"), ("canceled", "Cancelada")], default="trial", max_length=20)),
                ("billing_cycle", models.CharField(choices=[("monthly", "Mensal"), ("yearly", "Anual")], default="monthly", max_length=12)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("trial_ends_at", models.DateTimeField(blank=True, null=True)),
                ("current_period_end", models.DateTimeField(blank=True, null=True)),
                ("last_payment_at", models.DateTimeField(blank=True, null=True)),
                ("grace_days", models.PositiveIntegerField(default=3)),
                ("auto_renew", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "plan",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="subscriptions", to="billing.saasplan"),
                ),
            ],
            options={
                "verbose_name": "Assinatura do site",
                "verbose_name_plural": "Assinaturas do site",
            },
        ),
        migrations.RunPython(seed_default_plans, migrations.RunPython.noop),
    ]
