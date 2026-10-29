from django.core.management.base import BaseCommand

from api.package_subscriptions import expire_outdated_client_package_subscriptions


class Command(BaseCommand):
    help = (
        "Expira assinaturas de pacote ativas cujo ends_at já passou. "
        "Agende no Render (Cron Job) por exemplo a cada hora: "
        "`python manage.py expire_outdated_subscriptions`."
    )

    def handle(self, *args, **options):
        updated = expire_outdated_client_package_subscriptions()
        self.stdout.write(self.style.SUCCESS(f"Assinaturas atualizadas para expirado: {updated}"))
