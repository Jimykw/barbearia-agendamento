from datetime import time, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import Appointment, BusinessHours, ClientPackage, ClientPackageSubscription
from api.booking_slots import SERVICE_DURATION_MINUTES
from barbers.models import Barber
from services.models import Service

User = get_user_model()

SERVICES = (
    ("Corte", Decimal("50.00")),
    ("Barba", Decimal("40.00")),
    ("Corte + Barba", Decimal("80.00")),
    ("Platinado", Decimal("150.00")),
    ("Pigmenta\u00e7\u00e3o", Decimal("100.00")),
)

CUSTOMERS = (
    ("cliente1", "Cliente Um", "(79) 90000-0001"),
    ("cliente2", "Cliente Dois", "(79) 90000-0002"),
    ("cliente3", "Cliente Tr\u00eas", "(79) 90000-0003"),
    ("cliente4", "Cliente Quatro", "(79) 90000-0004"),
    ("cliente5", "Cliente Cinco", "(79) 90000-0005"),
)


class Command(BaseCommand):
    help = "Cria dados ficticios de demonstracao (idempotente)."

    def handle(self, *args, **options):
        password = str(getattr(settings, "DEMO_SEED_PASSWORD", "") or "demo12345")
        admin_password = str(getattr(settings, "DEMO_ADMIN_PASSWORD", "") or password)

        with transaction.atomic():
            self._seed_services()
            self._seed_business_hours()
            admin = self._upsert_user(
                "admin",
                "admin@example.com",
                admin_password,
                User.ROLE_ADMIN,
                "Administrador",
                "",
                role_admin=True,
            )
            barber_one = self._upsert_user(
                "barbeiro1", "barbeiro1@example.com", password, User.ROLE_BARBEIRO, "Barbeiro", "Um"
            )
            barber_two = self._upsert_user(
                "barbeiro2", "barbeiro2@example.com", password, User.ROLE_BARBEIRO, "Barbeiro", "Dois"
            )
            self._upsert_barber(barber_one, "barbeiro1", "Cortes classicos e acabamento.")
            self._upsert_barber(barber_two, "barbeiro2", "Barba, navalha e styling.")
            customers = [
                self._upsert_user(username, f"{username}@example.com", password, User.ROLE_CLIENTE, name, "", phone=phone)
                for username, name, phone in CUSTOMERS
            ]
            subscription = self._seed_subscription(customers[0])
            self._seed_appointments(customers, subscription)

        self.stdout.write(self.style.SUCCESS("seed_demo concluido."))
        self.stdout.write(f"  admin: admin@example.com / {admin_password}")
        self.stdout.write(f"  demais contas: cliente1..cliente5@example.com, barbeiro1@example.com, barbeiro2@example.com / {password}")

    def _seed_services(self):
        keys = {
            "Corte": Appointment.SERVICE_CORTE,
            "Barba": Appointment.SERVICE_BARBA,
            "Corte + Barba": Appointment.SERVICE_COMPLETO,
            "Platinado": Appointment.SERVICE_PLATINADO,
            "Pigmenta\u00e7\u00e3o": Appointment.SERVICE_PIGMENTACAO,
        }
        for name, price in SERVICES:
            Service.objects.update_or_create(
                name=name,
                defaults={
                    "price": price,
                    "duration_minutes": SERVICE_DURATION_MINUTES.get(keys[name], 30),
                    "is_active": True,
                },
            )

    def _seed_business_hours(self):
        hours = {
            0: (time(9, 0), time(20, 0), True),
            1: (time(9, 0), time(20, 0), True),
            2: (time(9, 0), time(20, 0), True),
            3: (time(9, 0), time(20, 0), True),
            4: (time(9, 0), time(20, 0), True),
            5: (time(9, 0), time(18, 0), True),
            6: (time(9, 0), time(18, 0), False),
        }
        for weekday, (open_time, close_time, is_open) in hours.items():
            BusinessHours.objects.update_or_create(
                weekday=weekday,
                defaults={"open_time": open_time, "close_time": close_time, "is_open": is_open},
            )

    def _upsert_user(self, username, email, password, role, first_name, last_name, phone="", role_admin=False):
        user = User.objects.filter(username=username).first()
        if user is None:
            user = User(username=username, email=email)
        user.email = email
        user.first_name = first_name
        user.last_name = last_name
        user.role = role
        user.phone = phone
        user.is_active = True
        user.is_staff = role_admin
        user.is_superuser = role_admin
        user.set_password(password)
        user.save()
        return user

    def _upsert_barber(self, user, calendar_key, bio):
        Barber.objects.update_or_create(
            user=user,
            defaults={
                "calendar_key": calendar_key,
                "bio": bio,
                "specialties": "Corte, barba, acabamento",
                "is_available": True,
            },
        )

    def _seed_subscription(self, customer):
        package = ClientPackage.objects.filter(name="Pacote Essencial").first()
        if package is None:
            package = ClientPackage.objects.create(
                name="Pacote Essencial",
                description="Pacote ficticio de demonstracao.",
                sessions=4,
                price=Decimal("169.90"),
                validity_days=45,
                is_active=True,
            )
        today = timezone.localdate()
        subscription = ClientPackageSubscription.objects.filter(
            customer=customer, package=package
        ).first()
        if subscription is None:
            subscription = ClientPackageSubscription(customer=customer, package=package)
        subscription.name = customer.get_full_name() or customer.username
        subscription.email = customer.email
        subscription.phone = customer.phone
        subscription.sessions_total = 4
        subscription.sessions_used = 1
        subscription.sessions_unlimited = False
        subscription.starts_at = today - timedelta(days=10)
        subscription.ends_at = today + timedelta(days=35)
        subscription.status = ClientPackageSubscription.STATUS_ACTIVE
        subscription.pending_login_notice = False
        subscription.login_notice_reason = ""
        subscription.save()
        return subscription

    def _seed_appointments(self, customers, subscription):
        today = timezone.localdate()
        rows = [
            (customers[0], "corte", "barbeiro1", today - timedelta(days=1), time(10, 0), Appointment.STATUS_CONCLUIDO, "pacote", subscription),
            (customers[1], "barba", "barbeiro2", today - timedelta(days=1), time(11, 0), Appointment.STATUS_CONCLUIDO, "dinheiro", None),
            (customers[2], "completo", "barbeiro1", today, time(9, 0), Appointment.STATUS_CONFIRMED, "", None),
            (customers[3], "corte", "barbeiro2", today, time(10, 0), Appointment.STATUS_CONCLUIDO, "pix", None),
            (customers[4], "platinado", "barbeiro1", today, time(14, 0), Appointment.STATUS_PENDING, "", None),
            (customers[1], "barba", "barbeiro1", today + timedelta(days=1), time(9, 30), Appointment.STATUS_CONFIRMED, "", None),
            (customers[0], "completo", "barbeiro2", today + timedelta(days=1), time(15, 0), Appointment.STATUS_PENDING, "", None),
            (customers[2], "pigmentacao", "barbeiro1", today + timedelta(days=2), time(10, 0), Appointment.STATUS_PENDING, "", None),
            (customers[3], "corte", "barbeiro2", today + timedelta(days=3), time(11, 0), Appointment.STATUS_CONFIRMED, "", None),
        ]
        for customer, service, barber, day, slot, status, payment, sub in rows:
            Appointment.objects.update_or_create(
                barber=barber,
                date=day,
                time=slot,
                defaults={
                    "customer": customer,
                    "name": customer.get_full_name() or customer.username,
                    "email": customer.email,
                    "phone": customer.phone,
                    "service": service,
                    "status": status,
                    "closing_payment_method": payment,
                    "package_subscription": sub,
                },
            )
