# Generated manually for portfolio site configuration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_alter_appointment_unique_active_slot"),
    ]

    operations = [
        migrations.CreateModel(
            name="PortfolioSiteConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("categories", models.JSONField(blank=True, default=list)),
                ("items", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Portfólio do site",
                "verbose_name_plural": "Portfólio do site",
            },
        ),
    ]
