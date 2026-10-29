# Sincronizacao e faturamento

## Sincronizacao de agendamentos

- `GET /api/appointments-sync/`: lista conforme o perfil (cliente ve os proprios; barbeiro ve a agenda dele a partir de hoje; admin ve todos).
- `GET /api/appointments-sync/today/`, `GET /api/appointments-sync/upcoming/`: recortes usados pelo hook do frontend.
- `GET /api/appointments-sync/by_status/?status=...` e `GET /api/appointments-sync/by_barber/?barber=...`: filtros.
- `GET /api/appointments-sync/stats/`: totais para os cartoes do painel.
- `PATCH /api/appointments-sync/<id>/` e `PATCH /api/appointments/<id>/sync/`: atualizacao de status.
- `GET/PUT/PATCH/DELETE /api/appointments/<id>/`: CRUD principal, com regra de dono/barbeiro/admin.

O hook `src/hooks/useAppointmentSync.ts` faz polling a cada 10 segundos (configuravel) e e usado pela pagina `/agendamentos-sync` e pelo componente `AppointmentSync`.

Conclusao de atendimento: ao mudar para `concluido`, o serializer aceita `payment_method` (`dinheiro` ou `pix`) e consome uma sessao do pacote vinculado, marcando o pacote como esgotado quando necessario.

## Faturamento

Modelos em `backend/billing/models.py`:

- `UsageTracking`: registra acoes por usuario (login, criacao de agendamento, acesso ao dashboard etc.).
- `ServiceUsageCost`: custo unitario por acao.
- `UserBilling`: fatura mensal por usuario.
- `SaaSPlan` e `SiteSubscription`: plano e assinatura unica do site (trial de 14 dias, tolerancia configuravel).
- `PaymentTransaction`: transacao por agendamento, com provedores `mercado_pago`, `dinheiro`, `pix` e `pacote`.
- `NotificationEvent`: historico de envios por e-mail e WhatsApp.

Endpoints:

- `GET /api/billing/`, `/api/usage-costs/`, `/api/payments/transactions/`, `/api/operations/notifications/`, `/api/subscription/plans/`.
- `GET /api/subscription/current/`, `POST /api/subscription/activate/`, `POST /api/subscription/mark-overdue/` (admin).
- `POST /api/payments/checkout/` (autenticado, dono do agendamento ou admin): cria preferencia no Mercado Pago usando o preco do servico cadastrado em `/api/services/`.
- `POST /api/payments/mercado-pago/webhook/`: exige `MERCADO_PAGO_WEBHOOK_SECRET`, valida `x-signature` (HMAC SHA-256 de `id:<payment_id>;request-id:<x-request-id>;ts:<ts>;`) e confirma o agendamento quando o pagamento e aprovado.

Com `DEMO_MODE=True`, checkout e webhook respondem `503` e os e-mails vao para o console.

## Regras de cobranca exibidas na UI

Os valores de tabela usados no dashboard, no painel do barbeiro e na conta do cliente sao:

| Servico | Valor |
| --- | --- |
| Corte | R$ 50 |
| Barba | R$ 40 |
| Corte + Barba | R$ 80 |
| Platinado | R$ 150 |
| Pigmentacao | R$ 100 |

O `seed_demo` grava os mesmos valores no catalogo de servicos, de modo que a cotacao exibida e a cobranca no checkout usam a mesma fonte.
