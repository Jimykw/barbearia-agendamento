from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from contacts.models import ContactMessage

User = get_user_model()


class ContactMessagePermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {
            "name": "Visitante",
            "email": "visitante@example.com",
            "phone": "79999990000",
            "subject": "Duvida",
            "message": "Mensagem de teste.",
        }

    def test_anonymous_can_create_message(self):
        response = self.client.post("/api/messages/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(ContactMessage.objects.filter(email="visitante@example.com").exists())

    def test_anonymous_cannot_list_messages(self):
        response = self.client.get("/api/messages/")
        self.assertIn(response.status_code, (401, 403))

    def test_non_admin_cannot_list_messages(self):
        user = User.objects.create_user("cliente", "cliente@example.com", "senha-forte-123")
        self.client.force_authenticate(user)
        response = self.client.get("/api/messages/")
        self.assertEqual(response.status_code, 403)

    def test_admin_can_list_messages(self):
        admin = User.objects.create_user(
            "admin-contato", "admin-contato@example.com", "senha-forte-123", role="admin"
        )
        ContactMessage.objects.create(**self.payload)
        self.client.force_authenticate(admin)
        response = self.client.get("/api/messages/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
