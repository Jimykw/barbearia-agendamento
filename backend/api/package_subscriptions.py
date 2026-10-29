"""Rotinas de manutenção de assinaturas de pacotes (fora do caminho quente de GET /api/auth/user/)."""

from django.utils import timezone

from .models import ClientPackageSubscription


def expire_outdated_client_package_subscriptions() -> int:
    """
    Expira assinaturas ativas cujo prazo já terminou.

    Retorna o número de linhas atualizadas. Destinado a cron/management command
    e a pontos de negócio onde listar pacotes (não em cada leitura de perfil).
    """
    today = timezone.localdate()
    return ClientPackageSubscription.objects.filter(
        status=ClientPackageSubscription.STATUS_ACTIVE,
        ends_at__isnull=False,
        ends_at__lt=today,
    ).update(
        status=ClientPackageSubscription.STATUS_EXPIRED,
        pending_login_notice=True,
        login_notice_reason="plan_date_expired",
        updated_at=timezone.now(),
    )
