from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0011_portfoliositeconfig"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="closing_payment_method",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Como o atendimento foi quitado ao concluir: dinheiro, pix ou pacote.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="clientpackagesubscription",
            name="login_notice_reason",
            field=models.CharField(
                blank=True,
                default="",
                help_text="sessions_depleted | plan_date_expired",
                max_length=40,
            ),
        ),
        migrations.AddField(
            model_name="clientpackagesubscription",
            name="pending_login_notice",
            field=models.BooleanField(
                default=False,
                help_text="Cliente ainda não viu o aviso de plano/sessões encerrados no próximo login.",
            ),
        ),
    ]
