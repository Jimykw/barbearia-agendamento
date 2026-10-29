from datetime import date, timedelta

from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from api.models import ClientPackage, ClientPackageSubscription
from api.serializers import (
    ClientPackageSubscriptionSerializer,
    _subscription_eligible_for_session_close,
)


class ClientPackageUnlimitedTests(TestCase):
    def test_eligible_when_unlimited_even_if_used_equals_total(self):
        pkg = ClientPackage.objects.create(
            name="Unl-pkg-eligible",
            description="",
            sessions=4,
            sessions_unlimited=True,
            price=10,
            validity_days=30,
            is_active=True,
        )
        today = date(2026, 6, 15)
        sub = ClientPackageSubscription(
            package=pkg,
            name="A",
            email="a_unl@test.com",
            phone="1",
            sessions_total=4,
            sessions_used=4,
            sessions_unlimited=True,
            starts_at=today - timedelta(days=1),
            ends_at=today + timedelta(days=10),
            status=ClientPackageSubscription.STATUS_ACTIVE,
        )
        self.assertTrue(_subscription_eligible_for_session_close(sub, today))

    def test_not_eligible_when_limited_and_depleted(self):
        pkg = ClientPackage.objects.create(
            name="Lim-pkg-eligible",
            description="",
            sessions=2,
            sessions_unlimited=False,
            price=10,
            validity_days=30,
            is_active=True,
        )
        today = date(2026, 6, 15)
        sub = ClientPackageSubscription(
            package=pkg,
            name="B",
            email="b_lim@test.com",
            phone="1",
            sessions_total=2,
            sessions_used=2,
            sessions_unlimited=False,
            starts_at=today - timedelta(days=1),
            ends_at=today + timedelta(days=10),
            status=ClientPackageSubscription.STATUS_ACTIVE,
        )
        self.assertFalse(_subscription_eligible_for_session_close(sub, today))

    def test_create_subscription_copies_unlimited_from_package(self):
        pkg = ClientPackage.objects.create(
            name="Unl-pkg-create",
            description="",
            sessions=3,
            sessions_unlimited=True,
            price=99,
            validity_days=45,
            is_active=True,
        )
        ser = ClientPackageSubscriptionSerializer(
            data={
                "package_id": pkg.id,
                "name": "Cliente",
                "email": "c_unl_create@test.com",
                "phone": "79999990001",
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        sub = ser.save()
        self.assertTrue(sub.sessions_unlimited)
        self.assertEqual(sub.sessions_total, 3)

class AppointmentConflictTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient

        from accounts.models import User
        from barbers.models import Barber

        barber_user = User.objects.create_user(
            "barbeiro-agenda",
            "barbeiro-agenda@example.com",
            "senha-forte-123",
            role="barbeiro",
        )
        Barber.objects.create(user=barber_user, calendar_key="barbeiro1", is_available=True)
        self.client = APIClient()

    def _payload(self):
        return {
            "name": "Cliente Teste",
            "email": "cliente.teste@example.com",
            "phone": "79999990000",
            "service": "corte",
            "barber": "barbeiro1",
            "date": (date.today() + timedelta(days=5)).isoformat(),
            "time": "10:00",
        }

    def test_second_booking_same_slot_is_rejected(self):
        first = self.client.post("/api/appointments/", self._payload(), format="json")
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post("/api/appointments/", self._payload(), format="json")
        self.assertEqual(second.status_code, 400)
        self.assertIn("non_field_errors", second.data["errors"])


@override_settings(DEMO_MODE=True)
class SeedDemoCommandTests(TestCase):
    def test_seed_demo_is_idempotent(self):
        from django.core.management import call_command

        from api.models import Appointment, ClientPackageSubscription
        from barbers.models import Barber
        from services.models import Service

        call_command("seed_demo", verbosity=0)
        counts = (
            Appointment.objects.count(),
            Barber.objects.count(),
            Service.objects.count(),
            ClientPackageSubscription.objects.count(),
        )
        call_command("seed_demo", verbosity=0)
        self.assertEqual(
            counts,
            (
                Appointment.objects.count(),
                Barber.objects.count(),
                Service.objects.count(),
                ClientPackageSubscription.objects.count(),
            ),
        )
        self.assertEqual(Service.objects.get(name="Corte").price, 50)
        self.assertTrue(
            Appointment.objects.filter(status=Appointment.STATUS_CONCLUIDO).exists()
        )

    @override_settings(DEMO_MODE=False)
    def test_seed_demo_refuses_to_run_outside_demo_mode(self):
        from django.core.management import call_command

        with self.assertRaises(CommandError):
            call_command("seed_demo", verbosity=0)


class DemoModeApiTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient

        self.client = APIClient()

    def test_healthz_is_public_and_database_free(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])

    def test_demo_status_and_login_are_disabled_outside_demo_mode(self):
        status_response = self.client.get("/api/demo/")
        self.assertEqual(status_response.status_code, 200)
        self.assertFalse(status_response.json()["demo_mode"])

        login_response = self.client.post(
            "/api/auth/demo-login/", {"role": "cliente"}, format="json"
        )
        self.assertEqual(login_response.status_code, 404)

    @override_settings(DEMO_MODE=True, DEMO_SEED_PASSWORD="demo12345")
    def test_demo_login_returns_tokens_for_seeded_account(self):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)

        status_response = self.client.get("/api/demo/")
        self.assertTrue(status_response.json()["demo_mode"])

        login_response = self.client.post(
            "/api/auth/demo-login/", {"role": "cliente"}, format="json"
        )
        self.assertEqual(login_response.status_code, 200, login_response.data)
        self.assertTrue(login_response.data["access"])
        self.assertEqual(login_response.data["user"]["username"], "cliente1")
