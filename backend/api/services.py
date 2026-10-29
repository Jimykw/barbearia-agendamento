from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Appointment


def create_appointment(user, data):
    appointment = Appointment(
        customer=user if user and user.is_authenticated else None,
        name=data.get("name"),
        email=data.get("email"),
        phone=data.get("phone"),
        service=data.get("service"),
        barber=data.get("barber"),
        date=data.get("date"),
        time=data.get("time"),
        status=data.get("status", Appointment.STATUS_PENDING),
    )
    try:
        appointment.full_clean()
        appointment.save()
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    except IntegrityError:
        raise ValidationError({"time": "Este horário já está ocupado para o barbeiro selecionado."})
    return appointment
