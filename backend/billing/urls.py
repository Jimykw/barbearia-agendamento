from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MercadoPagoCheckoutView,
    MercadoPagoWebhookView,
    NotificationEventViewSet,
    PaymentTransactionViewSet,
    SaaSPlanViewSet,
    SiteSubscriptionActivateView,
    SiteSubscriptionMarkOverdueView,
    SiteSubscriptionView,
    UserBillingViewSet,
    ServiceUsageCostViewSet,
)

router = DefaultRouter()
router.register(r'billing', UserBillingViewSet, basename='billing')
router.register(r'usage-costs', ServiceUsageCostViewSet, basename='usage-costs')
router.register(r'payments/transactions', PaymentTransactionViewSet, basename='payments-transactions')
router.register(r'operations/notifications', NotificationEventViewSet, basename='operations-notifications')
router.register(r'subscription/plans', SaaSPlanViewSet, basename='subscription-plans')

urlpatterns = [
    path("payments/checkout/", MercadoPagoCheckoutView.as_view(), name="payments-checkout"),
    path("payments/mercado-pago/webhook/", MercadoPagoWebhookView.as_view(), name="mercado-pago-webhook"),
    path("subscription/current/", SiteSubscriptionView.as_view(), name="subscription-current"),
    path("subscription/activate/", SiteSubscriptionActivateView.as_view(), name="subscription-activate"),
    path("subscription/mark-overdue/", SiteSubscriptionMarkOverdueView.as_view(), name="subscription-mark-overdue"),
    path('', include(router.urls)),
]
