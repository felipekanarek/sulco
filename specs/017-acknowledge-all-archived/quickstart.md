# Quickstart — Inc 17: Botão "Reconhecer tudo"

**Feature**: 017-acknowledge-all-archived
**Audience**: Felipe (validação manual pós-implementação)

Pré-requisitos:
- App rodando localmente (`npm run dev`).
- DB com pelo menos 1 user autenticado (sessão Clerk válida).
- Para alguns cenários, conta secundária pra validar isolation.

---

## Cenário 1 — Caso fundador (≥2 archived pendentes)

**Setup**: DB com 2+ records `archived = 1` e `archived_acknowledged_at IS NULL`
para o user logado.

```sql
-- preparar estado (substituir USER_ID pelo id da sessão atual)
UPDATE records SET archived = 1, archived_acknowledged_at = NULL
WHERE user_id = USER_ID AND id IN (101, 102, 103);
```

**Passos**:
1. Abrir `/status` em desktop (≥1024px).
2. Verificar header da seção "Discos arquivados" mostra contador
   "3 pendentes" (ou N).
3. Verificar botão "Reconhecer tudo" visível ao lado do contador.
4. Clicar "Reconhecer tudo".
5. Confirmação `window.confirm` aparece com texto contendo
   "Marcar todos os 3 como reconhecidos?".
6. Clicar OK na confirmação.

**Esperado**:
- Botão fica desabilitado com label "Reconhecendo…" brevemente.
- Página atualiza; seção "Discos arquivados" some.
- Banner global de archived (visível em qualquer rota) some.
- SQL confirma:
  ```sql
  SELECT COUNT(*) FROM records
  WHERE user_id = USER_ID AND archived = 1
    AND archived_acknowledged_at IS NULL;
  -- esperado: 0
  ```

---

## Cenário 2 — Cancelar a confirmação (FR-004)

**Setup**: estado igual ao Cenário 1.

**Passos**:
1. Abrir `/status`.
2. Clicar "Reconhecer tudo".
3. Quando `window.confirm` aparecer, clicar Cancelar.

**Esperado**:
- Nenhum write no DB (validar via SQL `SELECT` igual ao do Cenário 1
  → contagem permanece igual ao estado anterior).
- Botão volta ao estado clicável imediatamente (sem
  "Reconhecendo…").
- Seção e banner permanecem visíveis.

---

## Cenário 3 — Threshold (User Story 2 / FR-002)

**Setup A** (1 pendente):
```sql
-- deixar exatamente 1
UPDATE records SET archived = 1, archived_acknowledged_at = NULL
WHERE user_id = USER_ID AND id = 101;
UPDATE records SET archived_acknowledged_at = '2026-04-28T12:00:00Z'
WHERE user_id = USER_ID AND archived = 1 AND id != 101;
```

**Passos A**:
1. Abrir `/status`.

**Esperado A**:
- Seção "Discos arquivados" renderiza com 1 card.
- Header NÃO mostra botão "Reconhecer tudo".
- Card individual continua mostrando botão "Reconhecer".

**Setup B** (0 pendentes):
```sql
UPDATE records SET archived_acknowledged_at = '2026-04-28T12:00:00Z'
WHERE user_id = USER_ID AND archived = 1 AND archived_acknowledged_at IS NULL;
```

**Passos B**:
1. Abrir `/status`.

**Esperado B**:
- Seção "Discos arquivados" inteira NÃO renderiza (comportamento
  pré-existente preservado).
- Banner global some.

---

## Cenário 4 — Multi-user isolation (FR-007 / SC-003)

**Setup**: 2 users (DJ A e DJ B), cada um com 2+ archived pendentes.

**Passos**:
1. Logar como DJ A; abrir `/status`.
2. Clicar "Reconhecer tudo" e confirmar.
3. Verificar archived de DJ A reconhecidos.
4. Sair / logar como DJ B; abrir `/status`.

**Esperado**:
- DJ B vê todos os SEUS archived ainda pendentes (intactos).
- SQL:
  ```sql
  SELECT user_id, COUNT(*) FROM records
  WHERE archived = 1 AND archived_acknowledged_at IS NULL
  GROUP BY user_id;
  -- DJ A: 0
  -- DJ B: count original
  ```

---

## Cenário 5 — Mobile (Princípio V / FR-010 / SC-004)

**Setup**: estado igual ao Cenário 1 (≥2 pendentes). Browser em modo
device toolbar 375×667 (iPhone SE) e 390×844 (iPhone 14).

**Passos**:
1. Abrir `/status` em viewport mobile.
2. Inspecionar elemento do botão "Reconhecer tudo".
3. Medir tap target (DevTools Computed → height/width).
4. Tocar (clicar) o botão.
5. Confirmar a ação.

**Esperado**:
- Botão visível sem scroll horizontal.
- Tap target ≥ 44×44 px (`min-height: 44px` aplicado).
- Layout não quebra (header com flex-wrap quebra suavemente
  em telas estreitas; botão pode descer pra linha de baixo do
  contador, mas permanece clicável).
- `window.confirm` abre como overlay nativo fullscreen do iOS/Android
  (ou simulação no desktop devtools).
- Após confirmar, mesma resposta do Cenário 1.

---

## Cenário 6 — Race click (double-tap) / FR-009

**Setup**: estado igual ao Cenário 1.

**Passos**:
1. Abrir `/status`.
2. Clicar "Reconhecer tudo" e confirmar imediatamente.
3. Tentar clicar novamente o botão antes do refresh completar
   (timing curto — pode requerer DevTools throttling pra reproduzir).

**Esperado**:
- Segundo clique não dispara nada (botão `disabled` durante
  `isPending`).
- Label durante execução: "Reconhecendo…".
- Após sucesso, seção some — sem botão pra clicar.

---

## Cenário 7 — Erro de DB (raro)

**Setup**: parar `turso dev` ou desconectar DB durante execução
(simulação manual).

**Passos**:
1. Abrir `/status`, clicar "Reconhecer tudo", confirmar.
2. Antes da action completar, derrubar conexão DB.

**Esperado**:
- Mensagem de erro inline próxima ao botão:
  "Falha ao reconhecer — tente novamente."
- Estado do DB não alterado parcialmente (atomicidade — UPDATE
  nem chegou a comitar).
- Botão volta ao estado clicável.

---

## Validação cruzada — banner global

Após qualquer cenário com sucesso (1 ou 4):
1. Visitar `/` (home).
2. Verificar banner "N discos foram removidos da sua coleção…" some.
3. Visitar `/sets`, `/disco/[id]`.
4. Banner global some em todas as rotas.

---

## Encerramento

Cobertura mínima: cenários 1 + 3 + 5 (Princípio V) verificam o
caminho fundador + threshold + mobile. Cenários 2, 4, 6, 7 cobrem
edge cases.

Após validação, marcar feature como pronta para commit / merge /
release.
