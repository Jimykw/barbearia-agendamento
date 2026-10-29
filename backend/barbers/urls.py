from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BarberViewSet

router = DefaultRouter()
router.register(r"barbers", BarberViewSet)

app_name = "barbers"

urlpatterns = [
    path("", include(router.urls)),
]
