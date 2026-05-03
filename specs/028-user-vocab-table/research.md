# Research — Inc 33 / 028: Tabela `user_vocab` dedicada

**Phase**: 0
**Status**: todas as decisões pré-acordadas pelo mantenedor (Felipe) na sessão pós-Inc 28 — research consolida rationale e alternativas.

## Decisão 1 — Estrutura unificada (1 tabela com `kind`) vs. 5 tabelas separadas

**Decisão**: tabela única `user_vocab` com discriminator `kind` ∈ {`genres`, `styles`, `moods`, `contexts`, `shelves`}.

**Rationale**:
- 5 tabelas duplicariam DDL (CREATE TABLE × 5), index × 5, hooks separados, helpers separados.
- 1 tabela permite helper único `applyVocabDelta(userId, kind, added, removed)` que todos os 5 caminhos consomem — DRY.
- PK composta `(user_id, kind, term)` evita duplicação tão eficientemente quanto 5 tabelas.
- Index `(user_id, kind)` cobre toda listagem (`WHERE user_id=? AND kind=?`) com seek direto — sem custo de scan.
- Tamanho marginal: ~30 termos × 5 kinds × 5-10 users = ~1500 rows máx num horizonte de anos. Trivial.

**Alternativas consideradas**:
- **5 tabelas separadas** (`user_genres`, `user_styles`, etc.): rejeitado por duplicação. Útil só se um kind precisasse de schema diferente — não é o caso.
- **Coluna JSON com map `{kind: [{term, count}]}` em `user_facets`**: rejeitado por re-criar o problema atual (ler+escrever JSON inteiro a cada edição).

## Decisão 2 — Counter (`ref_count INTEGER`) vs. Set (boolean) vs. Lista de refs

**Decisão**: `ref_count INTEGER NOT NULL DEFAULT 0`. Increment em add, decrement em remove, DELETE quando chega a 0.

**Rationale**:
- **Permite delete preciso quando última referência some**: `ref_count = 0` → `DELETE`. Vocab limpo automaticamente, sem job de garbage collection.
- **Fornece ordering por uso**: pickers podem mostrar termos mais usados primeiro (`ORDER BY ref_count DESC`).
- **Permite UI futura "este mood é usado em N tracks"** sem query adicional.
- **Idempotente em estrutura**: 2 increments = 2; 1 decrement = volta a 1. Sem ambiguidade.

**Alternativas consideradas**:
- **Set boolean** (presença/ausência): rejeitado. Como saber quando deletar? Precisaria de COUNT(*) JOIN — volta o gargalo.
- **Lista de IDs referenciantes em coluna JSON**: rejeitado. Cresce sem limite, escrita de array O(N), bug-prone.
- **Counter sem clamp em 0** (permitir negativo): rejeitado. Drift latente acumularia. Clamp em 0 (`MAX(0, ref_count - 1)`) é defensivo.

## Decisão 3 — UPSERT atomic vs. SELECT-then-UPDATE

**Decisão**: `INSERT ... ON CONFLICT(user_id, kind, term) DO UPDATE SET ref_count = ref_count + 1, updated_at = unixepoch()`. SQLite/libsql suporta nativamente.

**Rationale**:
- 1 query atomic em vez de 2. Sem race condition entre SELECT e UPDATE.
- libsql + Drizzle suportam: `db.insert(userVocab).values({...}).onConflictDoUpdate({target: [...], set: {refCount: sql\`ref_count + 1\`, updatedAt: sql\`unixepoch()\`}})`.
- Custo: 1 row write (mesmo se já existe).

**Alternativas consideradas**:
- **SELECT WHERE PK → if exists UPDATE else INSERT**: rejeitado. 2 queries + race window.
- **Helper Drizzle de upsert via Zod**: irrelevante (queries são triviais aqui).

## Decisão 4 — Decrement com clamp

**Decisão**: `UPDATE user_vocab SET ref_count = MAX(0, ref_count - 1), updated_at = unixepoch() WHERE user_id=? AND kind=? AND term=?`. Após todos decrements de uma operação, `DELETE WHERE user_id=? AND kind=? AND ref_count=0`.

**Rationale**:
- **`MAX(0, ...)` defensivo**: se hook chamar decrement com termo que já está em 0 ou inexistente (drift), não quebra. Worst case: `ref_count` permanece 0; DELETE no fim limpa.
- **DELETE separado depois dos UPDATEs**: simplifica lógica. Roda 1× por operação no fim, não por cada decrement.
- **WHERE clause do DELETE pega TODOS os zeros** do user (não só da operação atual): aceitável porque garante limpeza incremental + cobre drift latente. Custo: scan de ~30 rows num index — trivial.

**Alternativas consideradas**:
- **DELETE inline com WHEN ref_count = 1**: SQLite não suporta DELETE condicional sem trigger. Rejeitado.
- **Deferir DELETE pro cron noturno**: rejeitado — vocab cresceria desnecessariamente entre runs.
- **Trigger SQL**: rejeitado — viola princípio de manter lógica visível em código TS.

## Decisão 5 — Diff em hooks (algoritmo padronizado)

**Decisão**: helper interno `diffVocabArrays(oldArr: string[], newArr: string[]): { added: string[], removed: string[] }` em `src/lib/queries/user-vocab.ts`. Usa `Set` pra performance O(N+M).

**Rationale**:
- Padroniza diff em todos os callers (`updateTrackCuration`, `applyDiscogsUpdate`).
- Helper puro, sem side effects, fácil de testar manualmente.
- Reusa pattern existente `setEquals` em `actions.ts` (Inc 27).

**Implementação**:
```ts
function diffVocabArrays(oldArr: string[], newArr: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((t) => !oldSet.has(t)),
    removed: oldArr.filter((t) => !newSet.has(t)),
  };
}
```

**Alternativas consideradas**:
- **Inline diff em cada caller**: rejeitado por duplicação.
- **Lib externa (lodash.difference)**: rejeitado — overkill, projeto evita libs novas sem justificativa forte.

## Decisão 6 — Cache strategy para `listVocab`

**Decisão**: `react.cache()` (request-scoped dedup) em vez de `unstable_cache` Next.js (TTL).

**Rationale**:
- `listVocab` é chamado em RSC durante render. `react.cache` evita queries duplicadas no mesmo render (ex: `listUserGenres` e `listUserStyles` em duas RSCs paralelas).
- TTL via `unstable_cache` é no-op em Vercel Hobby (Inc 23 confirmou). React.cache funciona universalmente.
- Vocab muda pouco mas pode mudar a qualquer write — TTL forçaria stale data. React.cache é per-request, sem staleness entre renders.
- Cache key composto: nome do helper + userId + kind, automatically pelo `react.cache(fn)` baseado em args.

**Alternativas consideradas**:
- **`cacheUser(fn, name)` (Inc 23 helper)**: rejeitado — adiciona complexidade de invalidação (revalidateUserCache em todas as Server Actions). Para vocab que muda pouco e é leitura barata (1 SELECT contra index com ~30 rows), o ganho é marginal.
- **Sem cache**: rejeitado — múltiplas RSCs paralelas (header de chips em /, /sets, /sets/[id]/montar, /disco/[id]) cada uma chamaria o helper. Dedup é trivial e ganha.

## Decisão 7 — `applyDiscogsUpdate` carrega genres/styles antigos

**Decisão**: `applyDiscogsUpdate` faz 1 SELECT extra de `{genres, styles}` do record existente antes do UPDATE, computa diff, chama `applyVocabDelta`. Para INSERT de record novo, increment direto sem diff (added=todos, removed=[]).

**Rationale**:
- Sem isso, sync re-incrementaria todos os termos a cada update (drift constante).
- 1 SELECT extra de 1 row é trivial — já estamos selecionando o record pra checar `archived`.
- Pattern já estabelecido (`applyRecordStatusDelta` Inc 27 lê status antigo antes de UPDATE).

**Alternativas consideradas**:
- **Não rodar hook em sync de records existentes** (só em INSERTs): rejeitado — Discogs pode atualizar genres/styles legitimamente (release re-tagueado). Sem hook, vocab fica desatualizado.
- **Diff lazy via cron**: rejeitado — UX latente (DJ vê chips errados até cron rodar).

## Decisão 8 — Archive/restore atomicidade

**Decisão**: `archiveRecord` carrega genres/styles do record + moods/contexts de TODAS as tracks do record + shelfLocation, chama `applyVocabDelta` por kind para decrementar tudo. Restore (reaparição via Inc 007) faz inverso (re-increment).

**Rationale**:
- 1 SELECT records + 1 SELECT tracks WHERE record_id = ? — custos triviais.
- Bulk decrement em uma operação atômica via `Promise.all` ou loop sequencial — ambos OK.
- Counter clamp em 0 protege se algum termo já estava em 0 (drift).

**Alternativas consideradas**:
- **Soft archive sem tocar vocab** (vocab continua refletindo coleção inteira incluindo archived): rejeitado — picker mostraria termos que só existem em archived, confundindo DJ ao montar set (não pode usar tracks archived).
- **Recompute completo no archive**: rejeitado — custo ~60k rows que estamos justamente eliminando.

## Decisão 9 — `recomputeFacets` futuro: re-popular `user_vocab` do zero

**Decisão**: `recomputeFacets(userId)` em `src/lib/queries/user-facets.ts` ganha sub-step que faz `DELETE FROM user_vocab WHERE user_id = ?` + repopula via SELECTs agregados (mesmo padrão do backfill). Permanece exportado como fallback (chamado pelo cron diário, `runIncrementalSync` no fim, `runInitialImport` no fim).

**Rationale**:
- Drift residual (race em hooks, edição via SQL direto) é capturado em ≤24h pelo cron.
- Mantém `recomputeFacets` como fonte de verdade para casos extremos — se hooks novos quebrarem, fallback total funciona.
- Custo do recompute completo (~10k rows lidos 1× / dia / user) é marginal vs. fazer recompute em CADA write (~10k rows × N writes / dia).

**Alternativas consideradas**:
- **Deletar `recomputeFacets` inteiro**: rejeitado — perdemos o fallback. Pareceu prematuro pre-validation.
- **Reduzir cron pra weekly**: rejeitado — drift de 7 dias é muito (DJ veria termos errados em pickers).

## Decisão 10 — Casing/whitespace de termos

**Decisão**: vocabulário é case-sensitive e space-sensitive. "Solar" e "solar" são entries distintos. Decisão herdada de Inc 24 (user_facets já era assim).

**Rationale**:
- Canonicalização automática (forçar lowercase) confundiria DJ que usa caixa intencionalmente (ex: "Bossa Nova" vs "bossa nova").
- Backfill preserva casing exato de records/tracks.
- Inc futuro pode adicionar "merge term" UI (DJ junta "Solar" e "solar" manualmente) se virar problema.

**Alternativas consideradas**:
- **Lowercase forçado**: rejeitado — perda de informação intencional do DJ.
- **Trim mas sem case-fold**: já é o comportamento (todas as escritas em moods/contexts/etc. já passam por trim em Server Actions existentes).

## Decisão 11 — `listSelectedVocab` semântica oficial

**Decisão**: pós-Inc 33, `listSelectedVocab(userId, kind)` é apenas wrapper de `listVocab(userId, kind)` — retorna termos com `ref_count > 0`. Semântica fica oficialmente: termos em uso real (em qualquer record/track não-arquivado), independente de `selected=true`/`status=active`.

**Rationale**:
- Inc 28 já tinha mudado pra esta semântica (derivava de `user_facets.moodsJson` que era conjunto geral). Inc 33 oficializa.
- DJ no /sets/[id]/montar pode ver moods que ainda não tem candidatos resultantes — picker mostra opções, não promessa de matches. Se filtro não tem resultados, DJ ajusta outros filtros.
- UX rework dos filtros (Inc 29 backlog) decide se quer mostrar count de candidatos ao lado de cada chip — fica fora desse Inc.

**Alternativas consideradas**:
- **Filtrar por tracks selected=true + record status=active**: rejeitado — voltaria scan de ~10k tracks por listagem, perdendo o ganho do Inc 33.
- **2 modos: vocab geral vs vocab "em uso de candidatos"**: rejeitado — complexidade desnecessária, deixar pro UX rework.

## Decisão 12 — Backfill: TRUNCATE + INSERT vs. INSERT ... ON CONFLICT

**Decisão**: `DELETE FROM user_vocab WHERE user_id = ?` (limpeza por user) + INSERTs frescos. Idempotente.

**Rationale**:
- Multi-user safe — apaga só do user em backfill, não do banco inteiro.
- Mais simples que ON CONFLICT (não precisa pensar em UPDATE de ref_count via merge).
- Backfill é one-time, custo de re-fazer é trivial.

**Alternativas consideradas**:
- **`INSERT ... ON CONFLICT DO UPDATE SET ref_count = excluded.ref_count`**: viável mas mais código. Sem ganho material.
- **Backfill agnostic via trigger SQL**: rejeitado (princípio III: lógica em TS visível).

## Decisão 13 — Hooks em `archiveRecord` vs. em `applyDiscogsUpdate` para arquivar

**Decisão**: hook de archive vai no Server Action `archiveRecord` em `src/lib/actions.ts`. `applyDiscogsUpdate` (sync) NÃO chama archive — apenas seta `archived=true` quando record desaparece do Discogs.

**Rationale**:
- `archiveRecord` é o ponto único de transição `archived=false → true` (manual via DJ ou via sync). Centralizar hook lá evita duplicação.
- Inverso (`restoreArchivedRecord` ou logica embedded em `applyDiscogsUpdate` quando record reaparece): também precisa hook de re-increment.

**Verificação no código**:
- Confirmar que `applyDiscogsUpdate` quando detecta record sumido do Discogs chama `archiveRecord` (ou função equivalente que centraliza). Se não, refatorar pra centralizar.

**Alternativas consideradas**:
- **Hook em ambos archiveRecord + sync**: rejeitado — duplicação propensa a divergir.
- **Hook em apenas sync, expondo função interna `archiveRecordWithVocab`**: rejeitado — convoluto.

## Decisão 14 — Transação em backfill (DELETE + INSERTs atômicos)

**Decisão**: rodar `DELETE` + `INSERT`s dentro de `db.transaction(async (tx) => {...})`. libsql suporta transações.

**Rationale**:
- Janela onde DELETE rodou mas INSERTs ainda não: pickers veem vocab vazio do user. Pequeno risco de UX em prod, mas transação evita.
- Custo de transação: trivial (~30 INSERTs por user).

**Alternativas consideradas**:
- **Sem transação**: rejeitado — risco de UX degradado durante backfill.
- **Soft refresh** (INSERT ON CONFLICT então DELETE WHERE term NOT IN ...): mais complexo.

## Resumo de decisões

| # | Decisão | Trade-off principal |
|---|---|---|
| 1 | 1 tabela com `kind` discriminator | DRY > 5 tabelas |
| 2 | `ref_count INTEGER` | Limpeza automática + ordering |
| 3 | UPSERT atomic | Atomicidade > 2 queries |
| 4 | Clamp `MAX(0, ref_count - 1)` + DELETE separado | Defensivo contra drift |
| 5 | Helper `diffVocabArrays` | DRY entre callers |
| 6 | `react.cache` request-scoped | Universal (Hobby + Pro) |
| 7 | Sync diff genres/styles | Manter vocab atualizado pós-sync |
| 8 | Archive bulk decrement | Picker reflete realidade ativa |
| 9 | `recomputeFacets` re-popula vocab | Drift correction via cron |
| 10 | Case+space-sensitive | Preserva intenção do DJ |
| 11 | `listSelectedVocab` = `listVocab` | Oficializa Inc 28 |
| 12 | Backfill DELETE+INSERT por user | Multi-user safe |
| 13 | Hook em `archiveRecord` centralizado | Evita duplicação sync vs manual |
| 14 | Backfill em transação | Sem janela de vocab vazio |
