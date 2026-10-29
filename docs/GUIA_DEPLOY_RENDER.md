# Deploy no Render

O repositorio inclui `render.yaml` na raiz: um Blueprint que cria um **Web Service
gratuito em modo demonstracao**, sem Docker e sem PostgreSQL.

## Demo online (Blueprint)

1. No painel do Render, escolha **New > Blueprint** e aponte para o repositorio.
2. O Render le `render.yaml` e cria o servico `barbearia-demo` com:
   - Root Directory: `backend`
   - Build Command: `bash build.sh`
   - Start Command: `bash start.sh`
   - Health Check Path: `/healthz`
   - `DEMO_MODE=true`, `DEMO_DB_PATH=/tmp/barbearia-demo.sqlite3`
   - `SECRET_KEY` gerada automaticamente
   - `PYTHON_VERSION=3.12.10` e `NODE_VERSION=22`
3. Confirme a criacao e aguarde o primeiro build.
4. Abra a URL `https://barbearia-demo-99p1.onrender.com` e faca login
   pelos botoes demo.

### O que acontece no arranque

- `build.sh` compila a SPA, instala dependencias e roda `collectstatic`.
- `start.sh` detecta `DEMO_MODE=true`, apaga o SQLite, roda `migrate` e executa
  `seed_demo`, e so entao inicia o Gunicorn.
- O SQLite fica em `/tmp`, entao a base e recriada a cada deploy/reinicio. Nada e
  persistido entre sessoes.
- Nenhuma integracao externa e chamada: WhatsApp, SMTP e Mercado Pago ficam
  desativados; o checkout responde com um pagamento simulado.

### Monitor de uptime

No Render (ou em um servico externo como UptimeRobot), crie um monitor HTTP:

- URL: `https://barbearia-demo-99p1.onrender.com/healthz`
- Intervalo: 5 minutos
- Metodo: GET, esperando status `200`

O endpoint nao consulta o banco e responde `{"ok": true, "demo": true}`. Ele tambem
reduz o efeito do cold start do plano gratuito (a primeira visita ainda pode levar
cerca de 1 minuto).

## Variaveis de ambiente (demo)

Definidas no `render.yaml`; ajuste no painel se necessario:

| Variavel | Valor | Observacao |
| --- | --- | --- |
| `DJANGO_ENV` | `prod` | ativa `core/settings/prod.py` |
| `DEMO_MODE` | `true` | SQLite, seed automatico, integracoes desativadas |
| `DEMO_DB_PATH` | `/tmp/barbearia-demo.sqlite3` | recriado a cada arranque |
| `DEMO_SEED_PASSWORD` | `demo12345` | senha das contas ficticias |
| `DEMO_ADMIN_PASSWORD` | `demo12345` | senha do admin demo |
| `SECRET_KEY` | gerada pelo Render | nao commitar |
| `PYTHON_VERSION` | `3.12.10` | runtime |
| `NODE_VERSION` | `22` | necessario para o build da SPA |

`ALLOWED_HOSTS` e `CSRF_TRUSTED_ORIGINS` recebem automaticamente o host
`RENDER_EXTERNAL_HOSTNAME`. Se usar um dominio proprio, defina essas variaveis
manualmente no painel.

## Deploy sem modo demo

Para um ambiente com PostgreSQL e integracoes reais:

- `DEMO_MODE=false` (ou remova a variavel);
- defina `DATABASE_URL` do PostgreSQL do Render;
- defina `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` e `CORS_ALLOWED_ORIGINS`;
- substitua o Start Command por `bash start.sh` (ele roda apenas `migrate` quando
  `DEMO_MODE` nao esta ativo) e mantenha `bash build.sh`;
- `seed_demo` nao roda e recusa execucao fora do modo demo;
- configure `MERCADO_PAGO_WEBHOOK_SECRET` antes de habilitar o checkout.

## Checklist de seguranca

- [ ] `SECRET_KEY` propria e fora do repositorio.
- [ ] `DEMO_MODE=true` para a demo publica.
- [ ] Senhas do seed trocadas se o ambiente deixar de ser demo.
- [ ] `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` e `CSRF_TRUSTED_ORIGINS` com o dominio final.

## Limitacoes conhecidas

- JWT fica em `localStorage` (risco de XSS); nao ha CSP.
- No modo demo o SQLite e efemero: reinicios apagam alteracoes feitas na sessao.
- A midia enviada pelo dashboard usa o disco local do servico; no plano gratuito os
  arquivos somem a cada deploy.
- O Render Free hiberna por inatividade; a primeira visita depois disso e lenta.
