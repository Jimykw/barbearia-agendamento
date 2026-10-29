# Generated manually: liberar slot após concluído (constraint só para status ativos).

from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0009_appointment_package_subscription"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="appointment",
            name="unique_active_slot_per_barber",
        ),
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.UniqueConstraint(
                condition=Q(status__in=["pendente", "confirmado", "em_atendimento"]),
                fields=("barber", "date", "time"),
                name="unique_active_slot_per_barber",
            ),
        ),
    ]
