from django.db import migrations, models


def forwards_barber_slugs(apps, schema_editor):
    Appointment = apps.get_model("api", "Appointment")
    legacy_map = {
        "legacy_a": "barbeiro1",
        "legacy_b": "barbeiro2",
        "legacy_c": "barbeiro2",
        "legacy_d": "barbeiro1",
    }
    valid = {"barbeiro1", "barbeiro2"}
    for row in Appointment.objects.all():
        if row.barber in valid:
            continue
        row.barber = legacy_map.get(row.barber, "barbeiro1")
        row.save(update_fields=["barber"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0003_appointment_barber_calendar"),
    ]

    operations = [
        migrations.RunPython(forwards_barber_slugs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="appointment",
            name="barber",
            field=models.CharField(
                choices=[("barbeiro1", "Barbeiro 1"), ("barbeiro2", "Barbeiro 2")],
                max_length=50,
            ),
        ),
    ]
