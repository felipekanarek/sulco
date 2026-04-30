# Quickstart — Inc 19: Editar status do disco direto na grid

**Feature**: 019-edit-status-on-grid
**Audience**: Felipe (validação manual pós-implementação)

Pré-requisitos:
- App rodando localmente (`npm run dev`) ou em prod.
- DB com pelo menos 5 discos do user logado em estados variados:
  ≥3 `unrated`, ≥1 `active`, ≥1 `discarded`.

---

## Setup do estado

```sql
-- preparar 3 unrated, 2 active, 2 discarded para o user logado
UPDATE records SET status = 'unrated'
WHERE user_id = <USER_ID> AND archived = 0
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> AND archived = 0 LIMIT 3);

UPDATE records SET status = 'active'
WHERE user_id = <USER_ID> AND archived = 0
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> AND archived = 0 ORDER BY id LIMIT 2 OFFSET 3);

UPDATE records SET status = 'discarded'
WHERE user_id = <USER_ID> AND archived = 0
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> AND archived = 0 ORDER BY id LIMIT 2 OFFSET 5);
```

(Substitua `<USER_ID>`.)

---

## Cenário 1 — Aprovar disco unrated direto da grid (US1, FR-001/FR-002/FR-004)

**Passos**:
1. Abrir `/?status=unrated` em desktop.
2. Localizar 1 dos cards `unrated`.
3. Verificar visualmente: card mostra botões `Ativar` e
   `Descartar` (FR-002).
4. Clicar `Ativar`.

**Esperado**:
- Imediatamente (≤100ms): badge muda visualmente pra "Ativo"
  (verde/`text-ok`); botão "Salvando…" durante `isPending`
  (FR-009).
- Após ~1s (revalidação RSC): card desaparece da listagem
  (filtro `unrated` ativo — Inbox-zero pattern, Clarification Q1).
- SQL:
  ```sql
  SELECT status FROM records WHERE id = <recordId>;
  -- esperado: 'active'
  ```
- Curadoria do disco intacta (faixas, comentários — SC-006):
  ```sql
  SELECT COUNT(*) FROM tracks WHERE record_id = <recordId> AND selected = 1;
  -- esperado: igual ao count antes da mudança
  ```

---

## Cenário 2 — Descartar disco unrated (US1, FR-002)

**Passos**:
1. Repetir setup pra ter `unrated`.
2. `/?status=unrated`. Clicar `Descartar` em outro card.

**Esperado**:
- Badge muda imediato pra "Descartado" (`text-ink-mute`).
- Card some após ~1s.
- SQL: `status='discarded'`.

---

## Cenário 3 — Reativar disco descartado (US2)

**Passos**:
1. Abrir `/?status=discarded`.
2. Localizar card descartado.
3. Verificar: card mostra botão `Reativar` (apenas; sem
   Ativar/Descartar — FR-002).
4. Clicar `Reativar`.

**Esperado**:
- Badge muda imediato pra "Ativo".
- Card some após ~1s do filtro `discarded`.
- SQL: `status='active'`. Curadoria intacta (SC-006).

---

## Cenário 4 — Descartar disco já ativo (US2 acceptance #2)

**Passos**:
1. `/?status=active`. Localizar card ativo.
2. Verificar: card mostra apenas `Descartar` (FR-002).
3. Clicar `Descartar`.

**Esperado**:
- Badge muda imediato pra "Descartado".
- Card some após ~1s.
- Faixas selecionadas continuam intactas (SC-006).

---

## Cenário 5 — Curadoria preservada em transições (SC-006)

**Setup**: escolher 1 disco com tracks ricamente curadas (BPM,
mood, comment, ai_analysis preenchidos).

**Passos**:
1. Anotar via SQL todos os campos AUTHOR das faixas:
   ```sql
   SELECT id, bpm, musical_key, energy, moods, contexts, comment,
     ai_analysis, selected, fine_genre, references, rating
   FROM tracks WHERE record_id = <recordId>;
   ```
2. Mudar status `unrated → active → discarded → active` via
   botões da grid (3 cliques sequenciais com refresh entre).
3. Re-rodar a query SQL.

**Esperado**:
- Resultado byte-idêntico antes/depois (SC-006).
- `records.notes`, `records.shelf_location` também intactos.

---

## Cenário 6 — Race click / botão disabled durante isPending (FR-009)

**Passos**:
1. `/?status=unrated`. Localizar card.
2. DevTools → Network → throttling "Slow 3G" (pra alongar a
   janela de pending).
3. Clicar `Ativar` e tentar clicar `Descartar` rapidamente
   antes do response.

**Esperado**:
- Após o 1º clique: ambos os botões ficam `disabled`,
  `opacity-50`, `cursor-not-allowed`.
- O 2º clique não dispara nada (handler retorna early se
  `isPending`).
- Após response do 1º: badge ativa; card some (revalidação).
- DJ não consegue "cancelar" a ação otimista — comportamento
  aceito.

---

## Cenário 7 — Falha de servidor + rollback visual (US3, FR-005)

**Setup**: parar Turso local OU forçar erro temporário.

**Passos**:
1. `/?status=unrated`. Clicar `Ativar` em algum card.
2. (Servidor falha — action retorna `{ ok: false, error: ... }`
   ou throw.)

**Esperado**:
- Card mostra "Salvando…" brevemente, depois:
  - Badge volta a "Não avaliado" (rollback visual).
  - Mensagem de erro inline aparece próxima ao botão:
    "Falha ao atualizar — tente novamente.".
- Após ~5s: mensagem de erro some automaticamente
  (Clarification Q2).
- SQL: `status` permanece `'unrated'` (sem write parcial).

---

## Cenário 8 — Mensagem de erro some ao disparar nova ação (US3 acceptance #2/#3)

**Setup**: estado pós-erro (cenário 7) com mensagem visível.

**Passos**:
1. Antes dos 5s, clicar em outro botão de status (mesmo card
   ou outro).

**Esperado**:
- Mensagem antiga some imediatamente (não espera os 5s).
- Nova ação procede normalmente (otimistic UI muda badge novo).

---

## Cenário 9 — Mobile (Princípio V / FR-010 / SC-003)

**Passos**:
1. DevTools device toolbar: 375×667 (iPhone SE).
2. `/`. Verificar layout do `<RecordRow>`.
3. Inspecionar tap target dos botões `Ativar`/`Descartar`
   (Computed → height/width).
4. Tocar `Ativar`.
5. Repetir em viewport 390×844 e 414×896.

**Esperado**:
- Botões visíveis sem scroll horizontal.
- Tap target ≥44×44 px (`min-h-[44px]` aplicado).
- Layout não quebra; `<StatusBadge>` e botões coabitam sem
  sobreposição.
- Toque dispara ação igual ao desktop.

---

## Cenário 10 — Mobile / View grid (`?view=grid`)

**Passos**:
1. Mobile 375×667. `/?view=grid`.
2. Cada `<RecordGridCard>` mostra capa + meta + botões na
   parte inferior do card.
3. Tocar botão `Ativar` em um card.

**Esperado**:
- Card preserva layout vertical (capa em cima, info no meio,
  botões embaixo).
- Tap target ≥44×44 px.
- Densidade da grid aceitável (não regredir significativamente
  a contagem de cards visíveis vs antes do Inc 19).

---

## Cenário 11 — Acessibilidade (FR-012)

**Passos**:
1. Desktop. Focar 1º card via Tab.
2. Inspecionar `aria-label` do botão `Ativar` via DevTools.
3. Pressionar Enter.
4. (Opcional) usar VoiceOver (Cmd+F5) ou NVDA.

**Esperado**:
- `aria-label` formato: "Ativar disco {artista} — {título}".
- Foco visível (outline) no botão focado.
- Enter dispara a ação.
- Leitor de tela anuncia: "Ativar disco Caetano Veloso — Transa,
  botão" (ou similar conforme leitor).
- Após ação, botões somem (status mudou) e foco move
  naturalmente — sem trap.

---

## Cenário 12 — Multi-user isolation (FR-008 / SC-005)

**Setup**: 2 contas (DJ A e DJ B) com discos próprios.

**Passos**:
1. Logar como DJ A. Mudar status de discos seus.
2. Logar como DJ B. Verificar discos de B.

**Esperado**:
- Discos de B intactos (status, todas as colunas).
- SQL: `SELECT user_id, COUNT(*), status FROM records GROUP BY user_id, status` confirma isolation.

---

## Cenário 13 — Discos archived sem botões

**Setup**: 1 disco com `records.archived=1`.

**Passos**:
1. `/?status=archived` (ou filtro equivalente).
2. Localizar card archived.

**Esperado**:
- Card mostra `<StatusBadge>` (status histórico) mas SEM
  botões `<RecordStatusActions>`.
- Pra "reativar" um archived, fluxo é via
  `/disco/[id]` (escopo do Inc 11/017 cobre archive separadamente).

---

## Validação de densidade (SC-004)

**Passos**:
1. Abrir `/` em desktop 1280×800 antes da feature (commit anterior
   ao branch). Contar cards visíveis sem scroll.
2. Repetir com a feature mergeada. Contar cards.

**Esperado**:
- Diferença ≤20% em ambas as views (list e grid). Aceita uma
  pequena redução pelo espaço extra dos botões.

---

## Encerramento

Cobertura mínima: cenários 1, 3, 7 e 9 (mobile) cobrem o caminho
fundador + edge crítico. Cenários 2, 4, 5, 6, 8, 10–13 cobrem
robustez e edge cases.

Após validação, marcar feature pronta para commit / merge / deploy.
