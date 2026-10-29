"""Registro de recebimento presencial ao encerrar atendimento (barbeiro)."""

from decimal import Decimal

from api.models import Appointment
from django.utils import timezone

from .models import PaymentTransaction

def _merge_raw_payload_preserving_package_plan_name(
    existing_payload: object,
    new_payload: dict,
) -> dict:
    """
    Mantém package_plan_name já persistido (plano vigente no momento do encerramento).
    Evita que um novo update_or_create substitua pelo nome atual do pacote na assinatura.
    """
    merged = dict(new_payload)
    prev = existing_payload if isinstance(existing_payload, dict) else {}
    prev_name = str(prev.get("package_plan_name") or "").strip()
    if prev_name:
        merged["package_plan_name"] = prev_name
    return merged


SERVICE_PRICES = {
    Appointment.SERVICE_CORTE: Decimal("50.00"),
    Appointment.SERVICE_BARBA: Decimal("40.00"),
    Appointment.SERVICE_COMPLETO: Decimal("80.00"),
    Appointment.SERVICE_PLATINADO: Decimal("150.00"),
    Appointment.SERVICE_PIGMENTACAO: Decimal("100.00"),
}


def record_presencial_payment(appointment: Appointment, payment_method: str) -> None:
    """
    Cria ou atualiza uma transação aprovada para dinheiro/Pix no balcão.
    Sessão de pacote: valor R$ 0,00 (evita contar receita avulsa duplicada), mas o evento aparece no admin.
    """
    if payment_method not in ("dinheiro", "pix"):
        return
    provider = (
        PaymentTransaction.PROVIDER_DINHEIRO
        if payment_method == "dinheiro"
        else PaymentTransaction.PROVIDER_PIX
    )
    used_package = bool(getattr(appointment, "package_subscription_id", None))
    amount = (
        Decimal("0.00")
        if used_package
        else SERVICE_PRICES.get(appointment.service, Decimal("50.00"))
    )
    raw_payload = {
        "source": "barber_close",
        "payment_method": payment_method,
        "package_session": used_package,
        "recorded_at": timezone.now().isoformat(),
    }
    if used_package:
        apt = (
            Appointment.objects.select_related("package_subscription__package")
            .filter(pk=appointment.pk)
            .first()
        )
        if apt and apt.package_subscription_id:
            try:
                raw_payload["package_plan_name"] = (
                    (apt.package_subscription.package.name or "").strip() or "Pacote"
                )
            except Exception:
                raw_payload["package_plan_name"] = "Pacote"
    ext_ref = f"presencial:{appointment.pk}"
    existing = (
        PaymentTransaction.objects.filter(appointment=appointment, external_reference=ext_ref)
        .values_list("raw_payload", flat=True)
        .first()
    )
    final_payload = _merge_raw_payload_preserving_package_plan_name(existing, raw_payload)
    PaymentTransaction.objects.update_or_create(
        appointment=appointment,
        external_reference=ext_ref,
        defaults={
            "provider": provider,
            "amount": amount,
            "status": PaymentTransaction.STATUS_APPROVED,
            "preference_id": "",
            "checkout_url": "",
            "payment_id": "",
            "raw_payload": final_payload,
        },
    )


def record_package_payment_transaction(appointment: Appointment) -> None:
    """
    Regista transação aprovada (valor R$ 0) para auditoria quando o atendimento é pago com sessão de pacote.
    """
    apt = (
        Appointment.objects.select_related("package_subscription__package")
        .filter(pk=appointment.pk)
        .first()
    )
    if not apt or not apt.package_subscription_id:
        return
    sub = apt.package_subscription
    pkg_name = "Pacote"
    try:
        if sub.package_id and getattr(sub.package, "name", None):
            pkg_name = (sub.package.name or "").strip() or pkg_name
    except Exception:
        pass
    ext_ref = f"pacote:{appointment.pk}"
    new_payload = {
        "source": "barber_close_package",
        "package_plan_name": pkg_name,
        "package_subscription_id": sub.id,
        "recorded_at": timezone.now().isoformat(),
    }
    existing = (
        PaymentTransaction.objects.filter(appointment=appointment, external_reference=ext_ref)
        .values_list("raw_payload", flat=True)
        .first()
    )
    final_payload = _merge_raw_payload_preserving_package_plan_name(existing, new_payload)
    PaymentTransaction.objects.update_or_create(
        appointment=appointment,
        external_reference=ext_ref,
        defaults={
            "provider": PaymentTransaction.PROVIDER_PACOTE,
            "amount": Decimal("0.00"),
            "status": PaymentTransaction.STATUS_APPROVED,
            "preference_id": "",
            "checkout_url": "",
            "payment_id": "",
            "raw_payload": final_payload,
        },
    )
