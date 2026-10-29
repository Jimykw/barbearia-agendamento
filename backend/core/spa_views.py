"""Serve o index.html da SPA React (mesma app que em / no router do frontend)."""
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles import finders
from django.http import FileResponse, Http404


def _resolve_spa_index_path() -> Path | None:
    """
    Resolve apenas ``spa/index.html`` (nome fixo do Vite).

    Não usar glob ``index*.html``: ficheiros como ``index-backup.html`` podem
    vir antes de ``index.html`` por ordem lexicográfica e servir HTML antigo.
    """
    found = finders.find("spa/index.html")
    if found:
        return Path(found)

    static_root = Path(settings.STATIC_ROOT).resolve()
    candidates = [
        static_root / "spa" / "index.html",
        Path(settings.BASE_DIR).resolve() / "static" / "spa" / "index.html",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    return None


def spa_index(request):
    """
    Devolve o ``index.html`` do build Vite para o React Router tratar o caminho.

    Cabeçalhos anti-cache: um HTML cacheado aponta para bundles antigos e causa
    “flash” de UI desatualizada até o utilizador fazer hard refresh.
    """
    index_path = _resolve_spa_index_path()
    if index_path is None:
        raise Http404(
            "Build do frontend não encontrado (spa/index.html). "
            "Confirme NODE_VERSION no Render e que o Build Command executa build.sh (npm run build + collectstatic)."
        )
    response = FileResponse(index_path.open("rb"), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    response["X-Content-Type-Options"] = "nosniff"
    return response
