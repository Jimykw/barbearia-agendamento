import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv
import dj_database_url

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def get_env_variable(name: str, default=None, required: bool = False):
    value = os.getenv(name, default)
    if required and value is None:
        raise ImproperlyConfigured(f"Missing required environment variable: {name}")
    return value


def _env_first(*names: str, default=None):
    """Retorna o primeiro valor não vazio entre várias chaves (ex.: SECRET_KEY ou DJANGO_SECRET_KEY)."""
    for name in names:
        value = os.getenv(name)
        if value is not None and str(value).strip() != "":
            return value
    return default


SECRET_KEY = _env_first("SECRET_KEY", "DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ImproperlyConfigured(
        "Defina SECRET_KEY ou DJANGO_SECRET_KEY no ambiente (por exemplo no ficheiro .env)."
    )

_debug_raw = _env_first("DEBUG", "DJANGO_DEBUG", default="False")
DEBUG = str(_debug_raw).lower() in ("1", "true", "yes")

# Logs de tempo em login / GET perfil (logger api.auth). Ativar com AUTH_TIMING_DEBUG=1 no ambiente.
_auth_timing_raw = _env_first("AUTH_TIMING_DEBUG", default="False")
AUTH_TIMING_DEBUG = str(_auth_timing_raw).lower() in ("1", "true", "yes")

_demo_raw = _env_first("DEMO_MODE", default="0")
DEMO_MODE = str(_demo_raw).lower() in ("1", "true", "yes")
DEMO_SEED_PASSWORD = get_env_variable("DEMO_SEED_PASSWORD", "demo12345")
DEMO_ADMIN_PASSWORD = get_env_variable("DEMO_ADMIN_PASSWORD", DEMO_SEED_PASSWORD)

_allowed_raw = _env_first("ALLOWED_HOSTS", "DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1")
ALLOWED_HOSTS = [host.strip() for host in str(_allowed_raw).split(",") if host.strip()]

INSTALLED_APPS = [
    "corsheaders",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt.token_blacklist",
    "api",
    "accounts",
    "services",
    "barbers",
    "contacts",
    "billing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"

def _resolve_database_ssl_require(database_url: str) -> bool:
    """
    PostgreSQL em cloud (Render, Supabase, etc.) exige SSL.
    Sem isto, qualquer query devolve 500 genérico em produção.
    """
    explicit = get_env_variable("DATABASE_SSL_REQUIRE", "")
    if str(explicit).lower() in ("1", "true", "yes"):
        return True
    if str(explicit).lower() in ("0", "false", "no"):
        return False

    if not database_url or str(database_url).startswith("sqlite"):
        return False

    url_lower = str(database_url).lower()
    if "sslmode=require" in url_lower or "sslmode=verify" in url_lower:
        return False

    cloud_hosts = (
        ".render.com",
        "supabase.co",
        "neon.tech",
        ".railway.app",
        "amazonaws.com",
        "elephantsql.com",
        "cockroachlabs.cloud",
    )
    if any(host in url_lower for host in cloud_hosts):
        return True

    if os.getenv("DJANGO_ENV", "dev").lower() == "prod" and url_lower.startswith(
        ("postgres://", "postgresql://")
    ):
        return True

    return False


_database_url_raw = get_env_variable("DATABASE_URL", default="")
DATABASE_URL = (
    str(_database_url_raw).strip()
    if _database_url_raw and str(_database_url_raw).strip()
    else f"sqlite:///{BASE_DIR / 'db.sqlite3'}"
)
DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=600,
        ssl_require=_resolve_database_ssl_require(DATABASE_URL),
    )
}

if DEMO_MODE:
    # Demo online: SQLite sempre, mesmo que DATABASE_URL aponte para PostgreSQL.
    # O start.sh apaga e recria este ficheiro a cada inicializacao.
    DEMO_DB_PATH = get_env_variable("DEMO_DB_PATH", str(BASE_DIR / "db.sqlite3"))
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": DEMO_DB_PATH,
            "OPTIONS": {"timeout": 20},
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_L10N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"


def whitenoise_spa_index_no_cache(headers, path: str, url: str) -> None:
    """
    WhiteNoise aplica ``max-age=60`` (produção) a ficheiros não-imutáveis.
    O ``index.html`` da SPA não deve ficar cacheado: referencia hashes de JS/CSS;
    HTML antigo + bundles novos (ou o inverso) causam “flash” de design errado.
    """
    path_norm = path.replace("\\", "/")
    url_norm = url.replace("\\", "/")
    if path_norm.endswith("/spa/index.html") or url_norm.rstrip("/").endswith("/static/spa/index.html"):
        headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        headers["Pragma"] = "no-cache"


WHITENOISE_ADD_HEADERS_FUNCTION = whitenoise_spa_index_no_cache

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": get_env_variable("API_RATE_LIMIT_ANON", "120/hour"),
        "user": get_env_variable("API_RATE_LIMIT_USER", "1200/hour"),
        "contact": get_env_variable("API_RATE_LIMIT_CONTACT", "10/hour"),
        "checkout": get_env_variable("API_RATE_LIMIT_CHECKOUT", "30/hour"),
    },
    "EXCEPTION_HANDLER": "core.exceptions.custom_exception_handler",
}

CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in get_env_variable("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    origin.strip() for origin in get_env_variable("CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()
]

_render_host = get_env_variable("RENDER_EXTERNAL_HOSTNAME", "").strip()
if _render_host:
    if _render_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_render_host)
    _render_origin = f"https://{_render_host}"
    if _render_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_render_origin)

if DEMO_MODE:
    # Demo publica: variaveis de integracao externa sao ignoradas de proposito.
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
    MERCADO_PAGO_ACCESS_TOKEN = ""
    MERCADO_PAGO_WEBHOOK_SECRET = ""
    WHATSAPP_ACCESS_TOKEN = ""

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = get_env_variable("SECURE_SSL_REDIRECT", "False").lower() in ("1", "true", "yes")
SESSION_COOKIE_SECURE = get_env_variable("SESSION_COOKIE_SECURE", "False").lower() in ("1", "true", "yes")
CSRF_COOKIE_SECURE = get_env_variable("CSRF_COOKIE_SECURE", "False").lower() in ("1", "true", "yes")
SECURE_HSTS_SECONDS = int(get_env_variable("SECURE_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = get_env_variable("SECURE_HSTS_INCLUDE_SUBDOMAINS", "False").lower() in ("1", "true", "yes")
SECURE_HSTS_PRELOAD = get_env_variable("SECURE_HSTS_PRELOAD", "False").lower() in ("1", "true", "yes")

DEFAULT_FROM_EMAIL = get_env_variable("DEFAULT_FROM_EMAIL", "noreply@localhost")
FRONTEND_URL = get_env_variable("FRONTEND_URL", "http://localhost:5173")
BACKEND_PUBLIC_URL = get_env_variable("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000")
MERCADO_PAGO_ACCESS_TOKEN = get_env_variable("MERCADO_PAGO_ACCESS_TOKEN", "")
MERCADO_PAGO_WEBHOOK_SECRET = get_env_variable("MERCADO_PAGO_WEBHOOK_SECRET", "")
WHATSAPP_ACCESS_TOKEN = get_env_variable("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = get_env_variable("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_VERIFY_TOKEN = get_env_variable("WHATSAPP_VERIFY_TOKEN", "")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": get_env_variable("DJANGO_LOG_LEVEL", "INFO"),
    },
}
