# Guia de testes

## Testes automatizados

### Backend

```powershell
cd backend
python manage.py test
```

Cobertura atual (16 testes):

- `api/tests.py`: regras de pacotes ilimitados, conflito de horario no mesmo barbeiro e idempotencia do `seed_demo`.
- `billing/tests.py`: checkout exige login, bloqueia nao-dono, respeita `DEMO_MODE` e ausencia de token; webhook rejeita assinatura invalida, exige segredo e confirma agendamento com assinatura valida.
- `contacts/tests.py`: criacao publica de mensagem, listagem restrita a admin.

### Frontend

```powershell
npm test
npm run check:imports
npm run build
```

- `npm test` executa o Vitest (copy de pacotes).
- `npm run check:imports` valida que os imports da SPA resolvem.
- `npm run build` garante que a SPA compila para `backend/static/spa`.

## Smoke test manual

1. Suba backend (`python manage.py runserver`) e frontend (`npm run dev`).
2. Acesse `http://localhost:5173` e confirme que a home carrega servicos e pacotes.
3. Crie um agendamento em `/agendamento` escolhendo um horario livre.
4. Repita o mesmo horario/barbeiro: a API deve responder `400` com aviso de horario ocupado.
5. Entre em `/login` com `cliente1@example.com` / `demo12345` e veja o agendamento em `/minha-conta`.
6. Entre com `admin@example.com` / `demo12345` e abra `/dashboard`:
   - agendamentos do seed aparecem;
   - relatorios em PDF sao gerados;
   - horarios, bloqueios e pacotes podem ser editados.
7. Entre com `barbeiro1@example.com` / `demo12345` e abra o painel do funcionario.
8. Envie uma mensagem pelo endpoint publico de contato:

```powershell
curl -X POST http://127.0.0.1:8000/api/messages/ `
  -H "Content-Type: application/json" `
  -d '{\"name\":\"Teste\",\"email\":\"teste@example.com\",\"subject\":\"Duvida\",\"message\":\"Mensagem\"}'
```

9. Tente listar mensagens sem token: a resposta deve ser `401`/`403`.
10. Com `DEMO_MODE=True`, confirme que o checkout responde `503` e que o terminal do Django imprime os e-mails em vez de envia-los.

## Limpeza

O banco local `backend/db.sqlite3`, o `.venv`, `node_modules` e `backend/static/spa` nao entram no Git.
Para recomecar os dados:

```powershell
Remove-Item backend\db.sqlite3
cd backend
python manage.py migrate
python manage.py seed_demo
```
