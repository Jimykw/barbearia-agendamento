import hashlib
import hmac
import json
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from api.models import Appointment
from billing.models import PaymentTransaction

User = get_user_model()


def make_user(username, email, role="cliente"):
    return User.objects.create_user(username, email, "senha-forte-123", role=role)


def make_appointment(customer, service="corte"):
    return Appointment.objects.create(
        customer=customer,
        name=customer.get_full_name() or customer.username,
        email=customer.email,
        phone="79999990000",
        service=service,
        barber="barbeiro1",
        date=date.today() + timedelta(days=2),
        time="09:00",
    )


class MercadoPagoCheckoutPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("dono", "dono@example.com")
        self.other = make_user("outro", "outro@example.com")
        self.appointment = make_appointment(self.owner)

    def test_anonymous_is_rejected(self):
        response = self.client.post(
            "/api/payments/checkout/",
            {"appointment_id": self.appointment.id},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))

    @override_settings(DEMO_MODE=False, MERCADO_PAGO_ACCESS_TOKEN="token-de-teste")
    def test_non_owner_gets_not_found(self):
        self.client.force_authenticate(self.other)
        response = self.client.post(
            "/api/payments/checkout/",
            {"appointment_id": self.appointment.id},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    @override_settings(DEMO_MODE=True)
    def test_demo_mode_simulates_payment_without_provider(self):
        self.client.force_authenticate(self.owner)
        with mock.patch("billing.views.urllib_request.urlopen") as urlopen:
            response = self.client.post(
                "/api/payments/checkout/",
                {"appointment_id": self.appointment.id},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["simulated"])
        urlopen.assert_not_called()
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.STATUS_CONFIRMED)
        transaction = PaymentTransaction.objects.get(appointment=self.appointment)
        self.assertEqual(transaction.status, PaymentTransaction.STATUS_APPROVED)
        self.assertTrue(transaction.raw_payload.get("simulated"))

    @override_settings(DEMO_MODE=False, MERCADO_PAGO_ACCESS_TOKEN="")
    def test_missing_provider_token_returns_503(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            "/api/payments/checkout/",
            {"appointment_id": self.appointment.id},
            format="json",
        )
        self.assertEqual(response.status_code, 503)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


@override_settings(
    DEMO_MODE=False,
    MERCADO_PAGO_ACCESS_TOKEN="token-de-teste",
    MERCADO_PAGO_WEBHOOK_SECRET="segredo-de-teste",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class MercadoPagoWebhookTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_user("webhook-cliente", "webhook@example.com")
        self.appointment = make_appointment(self.customer, service="completo")
        self.payload = {
            "id": "123456",
            "external_reference": f"appointment:{self.appointment.id}",
            "status": "approved",
            "transaction_amount": "80.00",
        }

    def _signature(self, payment_id="123456", ts="1700000000", request_id="req-1", secret="segredo-de-teste"):
        manifest = f"id:{payment_id};request-id:{request_id};ts:{ts};"
        digest = hmac.new(secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"ts={ts},v1={digest}"

    def test_invalid_signature_is_rejected(self):
        response = self.client.post(
            "/api/payments/mercado-pago/webhook/",
            {"data": {"id": "123456"}, "type": "payment"},
            format="json",
            HTTP_X_SIGNATURE="ts=1700000000,v1=invalida",
            HTTP_X_REQUEST_ID="req-1",
        )
        self.assertEqual(response.status_code, 401)

    def test_missing_secret_returns_503(self):
        with override_settings(MERCADO_PAGO_WEBHOOK_SECRET=""):
            response = self.client.post(
                "/api/payments/mercado-pago/webhook/",
                {"data": {"id": "123456"}, "type": "payment"},
                format="json",
            )
        self.assertEqual(response.status_code, 503)

    def test_valid_signature_confirms_appointment(self):
        with mock.patch(
            "billing.views.urllib_request.urlopen", return_value=FakeResponse(self.payload)
        ):
            response = self.client.post(
                "/api/payments/mercado-pago/webhook/",
                {"data": {"id": "123456"}, "type": "payment"},
                format="json",
                HTTP_X_SIGNATURE=self._signature(),
                HTTP_X_REQUEST_ID="req-1",
            )
        self.assertEqual(response.status_code, 200)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.STATUS_CONFIRMED)
        transaction = PaymentTransaction.objects.get(appointment=self.appointment)
        self.assertEqual(transaction.status, PaymentTransaction.STATUS_APPROVED)
        self.assertEqual(transaction.amount, 80)
