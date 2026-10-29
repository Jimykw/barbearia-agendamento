from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0008_clientpackage_clientpackagesubscription"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="package_subscription",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="consumed_appointments",
                to="api.clientpackagesubscription",
            ),
        ),
    ]
