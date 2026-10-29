# Barbearia Demo

Aplicacao web de agendamento para barbearia, com SPA React servida pelo Django e API REST.
Todos os dados deste repositorio sao ficticios: o projeto existe para demonstracao e portfólio.

## Funcionalidades

- Cadastro e login com JWT (e-mail ou username), alteracao e recuperacao de senha.
- Agendamento publico com escolha de servico, barbeiro, data e horario; consulta de disponibilidade e bloqueio de horarios ja ocupados.
- Area do cliente: proximos agendamentos, historico, dados do perfil e aviso de pacotes.
- Pacotes de sessoes com vigencia e consumo por atendimento.
- Painel do barbeiro: agenda do dia e conclusao de atendimentos.
- Dashboard administrativo: agendamentos, usuarios, servicos, horarios, bloqueios, pacotes, relatorios em PDF e notificacoes.
- Portfolio publico com categorias e imagens gerenciadas no dashboard.
- Faturamento de uso e assinatura do site, com integracao opcional ao Mercado Pago (checkout + webhook assinado).
- Notificacoes por e-mail e WhatsApp (Meta Cloud API), desativadas no modo demonstracao.

## Stack

- Backend: Python 3.12, Django 6.0, Django REST Framework, SimpleJWT, SQLite (dev) ou PostgreSQL, WhiteNoise.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router.
- Testes: `manage.py test` (Django) e Vitest (frontend).

## Como rodar

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# edite .env e defina SECRET_KEY
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

API em `http://127.0.0.1:8000`. O Smoke check fica em `GET /api/health/`.

### Frontend

```powershell
npm ci
npm run dev
```

SPA em `http://localhost:5173`. O arquivo `.env.example` da raiz define `VITE_API_URL`.

Para servir a SPA pelo Django em producao local:

```powershell
npm run build
cd backend
python manage.py collectstatic --no-input
python manage.py runserver
```

## Contas de demonstracao

Criadas por `python manage.py seed_demo` (idempotente). A senha padrao e `demo12345`,
configuravel por `DEMO_SEED_PASSWORD` e `DEMO_ADMIN_PASSWORD`.

| Perfil | E-mail |
| --- | --- |
| Admin | `admin@example.com` |
| Barbeiro | `barbeiro1@example.com` / `barbeiro2@example.com` |
| Cliente | `cliente1@example.com` ate `cliente5@example.com` |

O seed tambem cria servicos, horarios de funcionamento, pacotes compativeis e
agendamentos passados/futuros para as telas nao iniciarem vazias.

## Modo demonstracao

Defina `DEMO_MODE=True` no `backend/.env`:

- e-mails passam a ser impressos no console (`EMAIL_BACKEND` de console);
- envio de WhatsApp e desativado;
- checkout e webhook do Mercado Pago respondem `503`;
- o restante do fluxo (agendamento, pacotes, dashboard) continua funcional.

## Testes

```powershell
cd backend
python manage.py test

cd ..
npm test
npm run check:imports
npm run build
```

Os testes backend cobrem conflito de horario, seed idempotente, permissoes das
mensagens de contato e o fluxo de checkout/webhook do Mercado Pago (incluindo
assinatura HMAC). O frontend tem testes de copy de pacotes via Vitest.

## Estrutura

```text
backend/
  api/          agendamentos, disponibilidade, pacotes, portfolio, sync
  accounts/     usuario customizado e autenticacao
  barbers/      perfis e disponibilidade dos barbeiros
  billing/      faturamento, assinatura, Mercado Pago e notificacoes
  contacts/     contatos publicos e mensagens
  services/     catalogo de servicos
  core/         settings, urls, exceptions e SPA
src/
  app/pages/    paginas da SPA
  app/components/
  services/     cliente HTTP e JWT
  lib/          utilitarios e geracao de PDF
docs/           guias de deploy, testes e faturamento
```

## Seguranca e limitacoes

- JWT e armazenado em `localStorage`, o que expoe o token a XSS; para producao real, considerar cookies `HttpOnly`.
- Nao ha Content-Security-Policy configurada.
- O webhook do Mercado Pago exige `MERCADO_PAGO_WEBHOOK_SECRET` e valida `x-signature`; sem o segredo ele responde `503`.
- O checkout exige autenticacao, aceita apenas o dono do agendamento (ou admin) e usa o preco do catalogo de servicos.
- Senhas de demonstracao sao publicas por definicao; troque-as fora do modo demonstracao.
- O projeto e single-tenant e usa SQLite por padrao no desenvolvimento.

## Deploy

Passo a passo para Render em [docs/GUIA_DEPLOY_RENDER.md](docs/GUIA_DEPLOY_RENDER.md).
Guia de testes manuais em [docs/GUIA_TESTES.md](docs/GUIA_TESTES.md).
Detalhes de faturamento e sincronizacao em [docs/SINCRONIZACAO_E_FATURAMENTO.md](docs/SINCRONIZACAO_E_FATURAMENTO.md).
