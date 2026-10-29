from django.db import migrations, models


def backfill_hired_at(apps, schema_editor):
    Barber = apps.get_model("barbers", "Barber")
    for row in Barber.objects.filter(hired_at__isnull=True).iterator():
        row.hired_at = row.created_at
        row.save(update_fields=["hired_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("barbers", "0002_appointment_barber_calendar"),
    ]

    operations = [
        migrations.AddField(
            model_name="barber",
            name="hired_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Momento em que esta conta passou a atuar como barbeiro (última promoção).",
                null=True,
            ),
        ),
        migrations.RunPython(backfill_hired_at, migrations.RunPython.noop),
    ]
