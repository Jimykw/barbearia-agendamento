#!/usr/bin/env bash
# Build no Render (Root Directory: backend).
# Defina NODE_VERSION (ex.: 22) no servico Python para o npm existir no build.
#
# Ordem:
#   1) npm ci + npm run build - gera a SPA em static/spa (WhiteNoise / rota /).
#   2) pip install - dependencias Python.
#   3) collectstatic - copia estaticos (inclui a SPA) para STATIC_ROOT.
#
# Migracoes e seed rodam no start.sh (a demo recria o SQLite a cada arranque).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERRO: npm nao encontrado. No Render, defina NODE_VERSION=22 (ou 20) e redeploy."
  exit 1
fi

cd "$REPO_ROOT"
npm ci
npm run build

if [ ! -f "$SCRIPT_DIR/static/spa/index.html" ]; then
  echo "ERRO: nao foi gerado $SCRIPT_DIR/static/spa/index.html (npm run build / vite)."
  exit 1
fi

cd "$SCRIPT_DIR"
pip install -r requirements.txt
python manage.py collectstatic --no-input
