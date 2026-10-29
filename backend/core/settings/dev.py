from .base import *

DEBUG = True
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Base já define DATABASES a partir de DATABASE_URL (SQLite local ou PostgreSQL/Supabase).
# ALLOWED_HOSTS e CORS vêm das variáveis de ambiente em base.py.
