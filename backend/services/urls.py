from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ServiceViewSet

router = DefaultRouter()
router.register(r"services", ServiceViewSet)

app_name = "services"

urlpatterns = [
    path("", include(router.urls)),
]
