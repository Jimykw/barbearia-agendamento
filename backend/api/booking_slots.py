"""Regras compartilhadas de slots: durações, identificação de barbeiro e sobreposição de agendamentos."""
from datetime import datetime, timedelta, date
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Q

from barbers.models import Barber

from .models import Appointment


ACTIVE_APPOINTMENT_STATUSES = (
    Appointment.STATUS_PENDING,
    Appointment.STATUS_CONFIRMED,
    Appointment.STATUS_EM_ANDAMENTO,
)

SERVICE_PRICES = {
    Appointment.SERVICE_CORTE: Decimal("50.00"),
    Appointment.SERVICE_BARBA: Decimal("40.00"),
    Appointment.SERVICE_COMPLETO: Decimal("80.00"),
    Appointment.SERVICE_PLATINADO: Decimal("150.00"),
    Appointment.SERVICE_PIGMENTACAO: Decimal("100.00"),
}

SERVICE_DURATION_MINUTES = {
    Appointment.SERVICE_CORTE: 30,
    Appointment.SERVICE_BARBA: 25,
    Appointment.SERVICE_COMPLETO: 55,
    Appointment.SERVICE_PLATINADO: 90,
    Appointment.SERVICE_PIGMENTACAO: 40,
}


def appointment_duration_minutes(service_key: str) -> int:
    return SERVICE_DURATION_MINUTES.get((service_key or "").strip(), 30)


def barber_matching_q(barber: Barber) -> Q:
    """Filtra Appointment.barber (string livre legada) igual à chave atual ou ao username."""
    filt = Q()
    ck = (barber.calendar_key or "").strip()
    if ck:
        filt |= Q(barber__iexact=ck)
    uname = (barber.user.username or "").strip()
    if uname:
        filt |= Q(barber__iexact=uname)
    return filt


def active_appointments_for_barber(day: date, barber: Barber):
    """Agendamentos ativos do barbeiro na data (inclui variações de string em Appointment.barber)."""
    return Appointment.objects.filter(
        date=day,
        status__in=ACTIVE_APPOINTMENT_STATUSES,
    ).filter(barber_matching_q(barber))


def canonical_appointment_barber_key(raw_barber: str) -> str:
    """
    Valor gravado em Appointment.barber alinhado ao Barber.calendar_key do perfil correspondente,
    para evitar colisões por diferença de capitalização ou uso de username.
    """
    key = (raw_barber or "").strip()
    if not key:
        return key
    b = Barber.objects.filter(calendar_key__iexact=key).first()
    if b:
        trimmed = (b.calendar_key or "").strip()
        if trimmed:
            return trimmed
    b = Barber.objects.filter(user__username__iexact=key).select_related("user").first()
    if b:
        trimmed = (b.calendar_key or "").strip()
        if trimmed:
            return trimmed
        return key
    return key


def naive_interval_for_appointment(booking_date: date, apt: Appointment) -> tuple[datetime, datetime]:
    d = appointment_duration_minutes(apt.service)
    start = datetime.combine(booking_date, apt.time)
    end = start + timedelta(minutes=d)
    return start, end


def overlaps_interval_naive(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    return start_a < end_b and end_a > start_b


def aware_interval_for_appointment(day: date, apt: Appointment, tz: ZoneInfo) -> tuple[datetime, datetime]:
    d = appointment_duration_minutes(apt.service)
    start = datetime.combine(day, apt.time, tzinfo=tz)
    end = start + timedelta(minutes=d)
    return start, end


def aware_blocking_intervals(day: date, barber: Barber, tz: ZoneInfo) -> list[tuple[datetime, datetime]]:
    return [aware_interval_for_appointment(day, apt, tz) for apt in active_appointments_for_barber(day, barber)]


def aware_slot_overlaps_intervals(slot_start: datetime, duration_min: int, intervals: list[tuple[datetime, datetime]]) -> bool:
    slot_end = slot_start + timedelta(minutes=duration_min)
    for apt_start, apt_end in intervals:
        if slot_start < apt_end and slot_end > apt_start:
            return True
    return False
