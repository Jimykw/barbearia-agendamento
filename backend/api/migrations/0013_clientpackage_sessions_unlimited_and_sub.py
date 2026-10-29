from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0012_appointment_closing_payment_package_notice"),
    ]

    operations = [
        migrations.AddField(
            model_name="clientpackage",
            name="sessions_unlimited",
            field=models.BooleanField(
                default=False,
                help_text="Se verdadeiro, o pacote oferece sessões ilimitadas dentro da vigência.",
            ),
        ),
        migrations.AddField(
            model_name="clientpackagesubscription",
            name="sessions_unlimited",
            field=models.BooleanField(
                default=False,
                help_text="Se verdadeiro, não há limite de sessões até o fim da vigência.",
            ),
        ),
    ]
