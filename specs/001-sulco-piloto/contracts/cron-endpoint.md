# Contract — Cron Endpoint

Endpoint HTTP invocado pelo Vercel Cron uma vez por dia. Implementado em
`src/app/api/cron/sync-daily/route.ts` (App Router — handler `POST`).

---

## Invocação

`POST /api/cron/sync-daily`

**Headers obrigatórios** (Vercel Cron adiciona automaticamente):
- `x-vercel-cron: 1`
- `authorization: Bearer <CRON_SECRET>` (configurado em Vercel env e
  validado na rota)

**Schedule**: `0 7 * * *` UTC (= 04:00 `America/Sao_Paulo`).

**Configuração** em `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/sync-daily", "schedule": "0 7 * * *" }
  ]
}
```

---

## Comportamento

1. **Verificar autenticidade**:
   - Rejeita com `401` se `authorization` ausente ou não bate com
     `process.env.CRON_SECRET`.
2. **Listar usuários elegíveis**:
   ```sql
   SELECT id FROM users
    WHERE discogsUsername IS NOT NULL
      AND discogsTokenEncrypted IS NOT NULL
      AND discogsCredentialStatus = 'valid'
   ```
3. **Para cada usuário**, sequencialmente (ou com `Promise.all` limitado a 5):
   - Chama `runDailyAutoSync(userId)`.
   - Captura `SyncOutcome` e persiste em `syncRuns`.
   - Em `401` → `markCredentialInvalid(userId)` (FR-044); continua para
     próximo usuário.
4. **Retornar agregado**:
   ```json
   {
     "ran": 42,
     "ok": 40,
     "rate_limited": 1,
     "erro": 1,
     "durationMs": 23451
   }
   ```
5. Status HTTP: sempre `200` a menos que o próprio endpoint falhe (DB offline,
   etc). Falhas por usuário ficam no agregado.

---

## Observações de segurança

- O endpoint NÃO aceita parâmetros do usuário externo; só corpo vazio.
- `CRON_SECRET` MUST ser gerado com `openssl rand -base64 32` e armazenado
  em Vercel Environment Variables (nunca comitado).
- Em dev local, o endpoint pode ser exercitado manualmente com:
  ```bash
  curl -X POST http://localhost:3000/api/cron/sync-daily \
    -H "authorization: Bearer $CRON_SECRET"
  ```

---

## Limites

- Timeout do Vercel Cron: 300s (5 min) no free tier. Sync diário por usuário
  deve terminar em <1min (SC-009). Para o piloto (1 DJ), margem é enorme.
- Se o número de usuários crescer (SaaS futuro) a ponto de o cron estourar
  timeout, o trabalho deve ser particionado (ex: cada dia um subconjunto,
  ou introduzir fila/worker) — fora do escopo deste piloto.
