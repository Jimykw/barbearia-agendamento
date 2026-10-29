from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ContactViewSet, ContactMessageViewSet

router = DefaultRouter()
router.register(r"contacts", ContactViewSet)
router.register(r"messages", ContactMessageViewSet)

app_name = "contacts"

urlpatterns = [
    path("", include(router.urls)),
]
