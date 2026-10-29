import json
import re
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings
from django.core.mail import send_mail
from billing.models import NotificationEvent


def _normalize_br_phone(raw_phone: str) -> str:
    digits = re.sub(r"\D", "", str(raw_phone or ""))
    if not digits:
        return ""
    if digits.startswith("55") and len(digits) >= 12:
        return digits
    if len(digits) in {10, 11}:
        return f"55{digits}"
    return digits


def send_whatsapp_text(
    phone: str,
    message: str,
    *,
    event_type: str = "generic",
    appointment=None,
) -> bool:
    """Envia mensagem de WhatsApp via Meta Cloud API (best effort)."""
    if getattr(settings, "DEMO_MODE", False):
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_WHATSAPP,
            event_type=event_type,
            recipient=_normalize_br_phone(phone),
            message=message,
            status=NotificationEvent.STATUS_SKIPPED,
            provider_response={"detail": "DEMO_MODE: envio de WhatsApp desativado."},
        )
        return False
    access_token = str(getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")).strip()
    phone_number_id = str(getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")).strip()
    if not access_token or not phone_number_id:
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_WHATSAPP,
            event_type=event_type,
            recipient=_normalize_br_phone(phone),
            message=message,
            status=NotificationEvent.STATUS_SKIPPED,
            provider_response={"detail": "Credenciais WhatsApp não configuradas."},
        )
        return False

    to_number = _normalize_br_phone(phone)
    if not to_number:
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_WHATSAPP,
            event_type=event_type,
            recipient="",
            message=message,
            status=NotificationEvent.STATUS_SKIPPED,
            provider_response={"detail": "Telefone inválido para envio."},
        )
        return False

    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }
    req = urllib_request.Request(
        url=f"https://graph.facebook.com/v20.0/{phone_number_id}/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=15):
            NotificationEvent.objects.create(
                appointment=appointment,
                channel=NotificationEvent.CHANNEL_WHATSAPP,
                event_type=event_type,
                recipient=to_number,
                message=message,
                status=NotificationEvent.STATUS_SENT,
                provider_response={"detail": "Mensagem enviada."},
            )
            return True
    except urllib_error.HTTPError as exc:
        response_text = exc.read().decode("utf-8", errors="ignore")
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_WHATSAPP,
            event_type=event_type,
            recipient=to_number,
            message=message,
            status=NotificationEvent.STATUS_FAILED,
            provider_response={"http_error": response_text},
        )
        return False
    except Exception:
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_WHATSAPP,
            event_type=event_type,
            recipient=to_number,
            message=message,
            status=NotificationEvent.STATUS_FAILED,
            provider_response={"detail": "Erro interno durante envio."},
        )
        return False


def send_profile_email(
    email: str,
    subject: str,
    body: str,
    *,
    event_type: str = "generic_email",
    appointment=None,
) -> bool:
    recipient = str(email or "").strip().lower()
    if not recipient:
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_EMAIL,
            event_type=event_type,
            recipient="",
            message=body,
            status=NotificationEvent.STATUS_SKIPPED,
            provider_response={"detail": "E-mail ausente no perfil."},
        )
        return False

    try:
        sent_count = send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@localhost"),
            recipient_list=[recipient],
            fail_silently=False,
        )
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_EMAIL,
            event_type=event_type,
            recipient=recipient,
            message=body,
            status=NotificationEvent.STATUS_SENT if sent_count > 0 else NotificationEvent.STATUS_FAILED,
            provider_response={"sent_count": sent_count},
        )
        return sent_count > 0
    except Exception as exc:
        NotificationEvent.objects.create(
            appointment=appointment,
            channel=NotificationEvent.CHANNEL_EMAIL,
            event_type=event_type,
            recipient=recipient,
            message=body,
            status=NotificationEvent.STATUS_FAILED,
            provider_response={"error": str(exc)},
        )
        return False
