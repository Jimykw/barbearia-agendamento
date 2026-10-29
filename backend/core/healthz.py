from django.conf import settings
from django.http import JsonResponse


def healthz(request):
    """Ping leve para o monitor de uptime: sem sessao, autenticacao ou acesso a base de dados."""
    return JsonResponse({"ok": True, "demo": bool(getattr(settings, "DEMO_MODE", False))})
