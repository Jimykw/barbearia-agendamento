#!/usr/bin/env bash
# Arranque no Render.
# - DEMO_MODE=true: apaga o SQLite, migra e popula com seed_demo (dados ficticios).
# - DEMO_MODE=false: apenas migra e inicia o gunicorn.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

is_true() {
  case "${1:-}" in
    1|true|TRUE|True|yes|YES|on) return 0 ;;
    *) return 1 ;;
  esac
}

if is_true "${DEMO_MODE:-}"; then
  DB_PATH="${DEMO_DB_PATH:-$PWD/db.sqlite3}"
  case "$DB_PATH" in
    /*) ;;
    *) DB_PATH="$PWD/$DB_PATH" ;;
  esac
  echo "[start] DEMO_MODE ativo: recriando banco SQLite em $DB_PATH"
  rm -f "$DB_PATH"
  python manage.py migrate --no-input
  python manage.py seed_demo
else
  python manage.py migrate --no-input
fi

exec gunicorn core.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120
