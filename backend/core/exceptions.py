import logging

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        logger.error("Exceção não tratada na API: %s", exc, exc_info=True)
        return Response(
            {
                "detail": "Ocorreu um erro interno no servidor.",
                "code": "server_error",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(response.data, dict):
        raw = dict(response.data)
        detail = raw.get("detail")
        if isinstance(detail, list) and detail:
            detail = detail[0]

        if response.status_code == 400 and isinstance(raw, dict):
            messages = []
            for key, val in raw.items():
                if key == "detail":
                    continue
                if isinstance(val, list) and val:
                    first = val[0]
                    messages.append(f"{first}" if key == "non_field_errors" else f"{key}: {first}")
                elif isinstance(val, dict):
                    for nk, nv in val.items():
                        if isinstance(nv, list) and nv:
                            messages.append(f"{key}.{nk}: {nv[0]}")
            if messages and (not detail or detail == "Erro na requisição."):
                detail = "; ".join(messages)

        return Response(
            {
                "detail": detail or "Erro na requisição.",
                "errors": raw,
            },
            status=response.status_code,
        )

    return response
