# Deploy no Render

O repositorio tem dois pontos de entrada:

- `backend/build.sh`: instala dependencias, compila a SPA e roda `collectstatic` + `migrate`.
- `backend/Procfile`: inicia o Gunicorn com `core.wsgi:application` apos aplicar migracoes.

## 1. Banco de dados

Crie um PostgreSQL no Render e copie a `DATABASE_URL` (Internal Database URL).
O backend ativa SSL automaticamente para hosts conhecidos (incluindo `render.com`).

## 2. Web Service

- Runtime: Python 3.12
- Root Directory: `backend`
- Build Command: `./build.sh`
- Start Command: o Render usa o `Procfile`; se preferir, use
  `python manage.py migrate --no-input && gunicorn core.wsgi:application --bind 0.0.0.0:$PORT`
- Variavel `NODE_VERSION`: `22` (necessaria para `npm` durante o build)

## 3. Variaveis de ambiente

Obrigatorias:

| Variavel | Exemplo | Observacao |
| --- | --- | --- |
| `SECRET_KEY` | string longa e aleatoria | obrigatoria pelo `settings` |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL do Render |
| `ALLOWED_HOSTS` | `barbearia-demo.onrender.com` | dominio do servico |
| `DJANGO_ENV` | `prod` | ativa `core/settings/prod.py` |
| `CSRF_TRUSTED_ORIGINS` | `https://barbearia-demo.onrender.com` | obrigatorio para admin/forms |
| `CORS_ALLOWED_ORIGINS` | `https://barbearia-demo.onrender.com` | se a SPA for servida pelo Django, pode repetir o dominio |

Recomendadas:

| Variavel | Padrao | Efeito |
| --- | --- | --- |
| `DEMO_MODE` | `False` | e-mail no console, WhatsApp/Mercado Pago desativados |
| `DEMO_SEED_PASSWORD` | `demo12345` | senha das contas criadas pelo seed |
| `DEMO_ADMIN_PASSWORD` | igual ao anterior | senha do admin do seed |
| `FRONTEND_URL` | `http://localhost:5173` | retorno do Mercado Pago |
| `BACKEND_PUBLIC_URL` | `http://127.0.0.1:8000` | URL de webhook enviada ao Mercado Pago |
| `MERCADO_PAGO_ACCESS_TOKEN` | vazio | habilita checkout |
| `MERCADO_PAGO_WEBHOOK_SECRET` | vazio | obrigatorio para aceitar webhook |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | vazio | habilitam envio de WhatsApp |
| `API_RATE_LIMIT_ANON` / `API_RATE_LIMIT_USER` | `120/hour` / `1200/hour` | throttling global |
| `API_RATE_LIMIT_CONTACT` / `API_RATE_LIMIT_CHECKOUT` | `10/hour` / `30/hour` | throttling por endpoint |

Com `DJANGO_ENV=prod`, o projeto ativa redirect HTTPS, cookies seguros e HSTS (1 ano).

## 4. Primeiro deploy

1. O build roda `npm ci`, `npm run build`, `pip install`, `collectstatic` e `migrate`.
2. Se `SEED_DEMO_ON_DEPLOY=1`, o `seed_demo` roda ao final do build (idempotente).
3. Sem essa variavel, rode manualmente no Shell do Render:

```bash
cd backend
python manage.py seed_demo
```

4. Acesse `/api/health/` e depois a home.

## 5. Checklist de seguranca

- [ ] `SECRET_KEY` propria e fora do repositorio.
- [ ] `DEMO_MODE=False` apenas se for conectar servicos externos reais.
- [ ] `MERCADO_PAGO_WEBHOOK_SECRET` configurado se o checkout estiver ativo.
- [ ] Senhas do seed trocadas ou contas removidas em ambiente real.
- [ ] `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` e `CSRF_TRUSTED_ORIGINS` com o dominio final.
- [ ] Backup do PostgreSQL habilitado.

## Limitacoes conhecidas

- JWT fica em `localStorage` (risco de XSS); nao ha CSP.
- A midia enviada pelo dashboard usa o disco local do servico; em plano sem disco persistente, arquivos somem a cada deploy.
- O Render Free pode suspender o servico e expirar o PostgreSQL apos o periodo gratuito.
