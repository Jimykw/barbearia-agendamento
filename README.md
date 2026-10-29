# Barbearia Demo

Aplicacao web de agendamento para barbearia, com SPA React servida pelo Django e API REST.
Todos os dados deste repositorio sao ficticios: o projeto existe para demonstracao e portfólio.

## Demo online

- Aplicacao: **https://SEU-SERVICO.onrender.com** _(preencher apos o deploy)_
- Video de demonstracao: **[LINK_DO_VIDEO_AQUI]** _(preencher)_

A demo roda no plano gratuito do Render: a primeira visita (ou o primeiro acesso
apos o servico hibernar) pode levar cerca de **1 minuto** para responder. Na tela
de login existem os botoes "Admin demo", "Barbeiro demo" e "Cliente demo", visiveis
apenas quando `DEMO_MODE=true`.

Monitor de uptime: configure um ping HTTP em `https://SEU-SERVICO.onrender.com/healthz`
a cada 5 minutos. O endpoint responde `{"ok": true, "demo": true}` sem consultar a
base de dados e mantem o servico acordado com mais frequencia.

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
# edite .env: defina SECRET_KEY e DEMO_MODE=True
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

- a base passa a ser SQLite (`DEMO_DB_PATH`), mesmo que `DATABASE_URL` aponte para PostgreSQL;
- no deploy, `start.sh` apaga e recria a base e roda `seed_demo` a cada inicializacao;
- `seed_demo` recusa rodar quando `DEMO_MODE` nao esta ativo;
- e-mails passam a ser impressos no console e WhatsApp/Mercado Pago nao sao chamados;
- o checkout e simulado (transacao aprovada na hora) e a interface mostra o aviso de demonstracao;
- a tela de login exibe os botoes "Admin demo", "Barbeiro demo" e "Cliente demo";
- `GET /healthz` responde sem consultar a base de dados (monitor de uptime).

## Testes

```powershell
cd backend
python manage.py test

cd ..
npm test
npm run check:imports
npm run build
```

Os testes backend cobrem conflito de horario, seed idempotente (e bloqueio fora do
modo demo), permissoes das mensagens de contato, login demo, `/healthz` e o fluxo de
checkout/webhook do Mercado Pago (incluindo assinatura HMAC e pagamento simulado).
O frontend tem testes de copy de pacotes via Vitest.

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

O `render.yaml` da raiz cria um servico web gratuito em modo demo (SQLite recriado a
cada inicializacao, `SECRET_KEY` gerada pelo Render e health check em `/healthz`).
Passo a passo em [docs/GUIA_DEPLOY_RENDER.md](docs/GUIA_DEPLOY_RENDER.md).
Guia de testes manuais em [docs/GUIA_TESTES.md](docs/GUIA_TESTES.md).
Detalhes de faturamento e sincronizacao em [docs/SINCRONIZACAO_E_FATURAMENTO.md](docs/SINCRONIZACAO_E_FATURAMENTO.md).
