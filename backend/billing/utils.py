from datetime import timedelta

from django.utils import timezone

from billing.models import SiteSubscription, UsageTracking


def get_client_ip(request):
    """Extrai IP do cliente da requisição"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def track_user_action(user, action, metadata=None, request=None):
    """Rastreia ação do usuário para billing"""
    if not user or not user.is_authenticated:
        return
    
    ip_address = None
    user_agent = ""
    
    if request:
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')
    
    UsageTracking.objects.create(
        user=user,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata=metadata or {}
    )


def get_or_create_site_subscription():
    """Obtém a assinatura única do site (single-tenant)."""
    trial_end_default = timezone.now() + timedelta(days=14)
    subscription, _ = SiteSubscription.objects.get_or_create(
        pk=1,
        defaults={
            "status": SiteSubscription.STATUS_TRIAL,
            "trial_ends_at": trial_end_default,
        },
    )
    return subscription


def subscription_allows_bookings() -> bool:
    """Retorna se o site pode receber novos agendamentos."""
    subscription = get_or_create_site_subscription()
    now = timezone.now()

    if subscription.status in {SiteSubscription.STATUS_ACTIVE, SiteSubscription.STATUS_TRIAL}:
        if subscription.status == SiteSubscription.STATUS_TRIAL and subscription.trial_ends_at and now > subscription.trial_ends_at:
            return False
        return True

    if subscription.status == SiteSubscription.STATUS_PAST_DUE and subscription.current_period_end:
        grace_limit = subscription.current_period_end + timedelta(days=subscription.grace_days)
        return now <= grace_limit

    return False
