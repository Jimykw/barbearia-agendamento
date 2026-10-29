import os

ENVIRONMENT = os.getenv("DJANGO_ENV", "dev").lower()

if ENVIRONMENT == "prod":
    from .prod import *  # noqa: F401,F403
else:
    from .dev import *  # noqa: F401,F403
