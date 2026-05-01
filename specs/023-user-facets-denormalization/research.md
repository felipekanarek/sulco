# Research — Inc 24: Denormalização user_facets

**Feature**: 023-user-facets-denormalization
**Date**: 2026-05-01

Decisões de design tomadas antes de Phase 1.

---

## Decisão 1 — Recompute SÍNCRONO (Clarification Q1)

**Decision**: Server Actions de write **aguardam** `recomputeFacets`
terminar antes de retornar. Sem `after()` background.

**Rationale**:
- Frescor garantido na próxima leitura. Sem race entre write e
  RSC concorrente.
- Recompute completo cabe em <500ms na escala atual (~2500 records,
  ~10k tracks).
- Write total (write principal + recompute) ≤700ms — imperceptível
  ao DJ no fluxo de UI.
- Simplicidade > performance marginal. `after()` adicionaria race
  sutil que vira bug intermitente.

**Alternatives considered**:
- **`after()` background**: rejeitado pela clarify Q1.
- **Recompute incremental** (delta-update por write em vez de
  recompute completo): rejeitado por ora — complexidade alta;
  recompute completo cabe na escala atual. Revisitar se virar
  gargalo.

---

## Decisão 2 — JSON columns vs colunas tipadas separadas

**Decision**: usar TEXT columns com JSON serializado para listas
(`genres_json`, `styles_json`, `moods_json`, `contexts_json`,
`shelves_json`). Contadores ficam em colunas INTEGER tipadas.

**Rationale**:
- Listas são variáveis em tamanho (Felipe tem 30 prateleiras hoje;
  pode ter 100 amanhã). Schema tipado por valor distinto seria
  rígido.
- SQLite/libsql suporta JSON nativo via `json_each` (já usado pra
  facets atuais).
- Recuperação no JS é simples: `JSON.parse(row.genres_json)`.
- 1 row por user mantém isolation natural; tabela auxiliar
  (1 row por valor) seria mais reads.

**Alternatives considered**:
- **Tabela `user_facet_values` (1 row por par user/value)**:
  rejeitado — 1 SELECT por load vira N reads; perde a vantagem
  de denormalização.
- **Drizzle JSON column type**: TEXT com `default('[]')` é mais
  explícito e portável.

---

## Decisão 3 — Defaults seguros (FR-005)

**Decision**: `getUserFacets(userId)` retorna defaults vazios
(listas `[]`, contadores `0`) quando a row ainda não existe.
Evita NULL/erro em RSC durante janela entre criação de user e
primeiro recompute.

**Rationale**:
- Caso de borda: user novo (acabou de fazer onboarding) ou row
  perdida por algum motivo. Sem defaults, RSC jogaria erro 500.
- Defaults garantem zero crash. Próximo write/sync repopula.
- Aplicação prática: home com 0 records mostra empty state
  (já existe), não erro.

**Alternatives considered**:
- **Lançar erro se row ausente**: rejeitado — viola UX.
- **Auto-criar via INSERT default na primeira leitura**:
  rejeitado — leitura não deveria escrever (Princípio II).

---

## Decisão 4 — Recompute idempotente via UPSERT

**Decision**: `recomputeFacets(userId)` faz UPSERT (`INSERT ... ON
CONFLICT(user_id) DO UPDATE`) com TODOS os campos sempre
recalculados a partir das fontes. Idempotente: chamadas repetidas
produzem o mesmo resultado.

**Rationale**:
- FR-006 exige idempotência.
- Recompute completo (não delta) elimina drift potencial entre
  facets e dados-fonte.
- UPSERT atômico no SQLite (single statement).
- Trade-off: write read-heavy (recompute LÊ records + tracks
  inteiros), mas raros (writes ≪ reads).

**Alternatives considered**:
- **Delta updates** (incrementar/decrementar contadores conforme
  diff): rejeitado — frágil; pequenos bugs viram drift acumulado.
- **Trigger SQL nativo**: SQLite suporta, mas JOIN complexo +
  manutenção em código duplicado fora do TypeScript.

---

## Decisão 5 — Falha de recompute não bloqueia write (FR-008)

**Decision**: `recomputeFacets` envolvido em `try/catch`. Se
falhar, write principal já ocorreu — retornamos `{ ok: true }` e
logamos o erro. Próximo write da action tenta de novo.

**Rationale**:
- Write principal é o ato canônico do DJ. Falha em recompute
  (raríssima — DB indisponível) NÃO deve reverter o write.
- Stale temporário de facets é aceitável (próximo write corrige).
- Alinha com pattern já estabelecido (Server Actions de write
  retornam `ok: true` mesmo com side-effects que falham,
  ex: `revalidateUserCache` no Inc 022).

**Alternatives considered**:
- **Rollback do write se recompute falhar**: rejeitado — viola
  princípio "write principal é canônico"; quebra UX se DB der
  hiccup.
- **Retry interno com backoff**: rejeitado — adiciona latência;
  se DB caiu, retry não vai resolver.

---

## Decisão 6 — Backfill antes do deploy (FR-009)

**Decision**: ordem operacional do deploy:
1. Aplicar migration SQL via Turso shell (`CREATE TABLE IF NOT
   EXISTS user_facets ...`) — operação online, sem downtime.
2. Rodar `scripts/_backfill-user-facets.mjs` apontando pra prod
   (lê env `DATABASE_URL` + `DATABASE_AUTH_TOKEN`). Itera users e
   chama `recomputeFacets`. ~50ms × N users = poucos segundos
   no piloto.
3. Deploy do código novo via Vercel (que consome `user_facets`).

**Rationale**:
- Se deploy fosse antes do backfill, primeira leitura RSC
  retornaria defaults (listas vazias, contadores 0) — UI vazia
  brevemente até primeiro write disparar recompute.
- Ordem inversa garante que código novo sempre encontra dados
  populados.

**Alternatives considered**:
- **Backfill via cron/setup automático no boot**: rejeitado —
  inicialização da function lambda tem cold-start budget; backfill
  pode demorar.
- **Backfill via Server Action manual disparada por DJ**:
  rejeitado — UX confuso; DJ não sabe quando rodar.

---

## Decisão 7 — Server Actions cobertas e não-cobertas

**Decision** (matriz explícita pra evitar omissão):

**Cobertas (chamam `recomputeFacets`)**:
- `updateRecordStatus` — afeta records_active/unrated/discarded.
- `updateRecordAuthorFields` — afeta `shelves_json` se
  `shelfLocation` mudou; condicional dentro da action.
- `updateTrackCuration` — afeta `tracks_selected_total` (se
  `selected` mudou) + `moods_json/contexts_json` (se moods/
  contexts mudaram).
- `acknowledgeArchivedRecord` — afeta records totais (facets
  excluem archived).
- `acknowledgeAllArchived` — idem.
- `runIncrementalSync` (no fim) — adiciona/remove records +
  tracks.
- `runInitialImport` (no fim) — idem.

**Não cobertas** (não afetam facets):
- `enrichRecordOnDemand` — toca audio features (não em facets).
- `analyzeTrackWithAI`, `updateTrackAiAnalysis` — toca
  `tracks.aiAnalysis` (não em facets).
- `acknowledgeImportProgress` — toca `users.importAcknowledgedAt`
  (não em facets).
- `addTrackToSet`, `removeTrackFromSet`, etc. — tocam set_tracks
  (não em facets).
- `updateSet`, `createSet`, `deleteSet` — sets independentes.
- AI config actions — toca colunas de `users` (não em facets).
- Conta actions — não toca facets.

**Rationale**:
- Lista explícita evita esquecimento.
- Inc 22 (paginação) já desabilitou cache — facets é a fonte
  efetiva de frescor.

---

## Decisão 8 — Estrutura de `genres`/`styles` JSON (com count) vs simples (só value)

**Decision**: `genres_json` e `styles_json` armazenam
`[{value, count}]`. `moods_json`, `contexts_json`, `shelves_json`
armazenam `string[]` simples.

**Rationale**:
- `<FilterBar>` (home) mostra contagem inline em chips de gênero
  e estilo (ex: "Jazz · 47"). Precisa de `{value, count}`.
- Moods/contexts/shelves não mostram contagem na UI atual
  (vocabulário é só lista de termos sugeridos pra autocomplete).
- Schema reflete uso real — sem dados redundantes.

**Alternatives considered**:
- **Sempre `[{value, count}]`**: rejeitado — desperdiça espaço
  pra moods/contexts/shelves que não mostram count.
- **Sempre só `string[]`**: rejeitado — perderia a contagem que
  o `<FilterBar>` precisa.

---

## Decisão 9 — Migration aplicada via Turso shell (mesmo padrão Inc 022)

**Decision**: schema delta vai pra `schema.ts` (rastreabilidade)
e migration SQL aplicada manualmente via `turso db shell sulco-prod`
em prod. Backfill rodado localmente apontando pra prod.

**Rationale**:
- Pattern do projeto (Inc 010/012/013/022).
- `db:push` interactive falha em non-TTY (anti-pattern documentado
  em CLAUDE.md).
- `CREATE TABLE IF NOT EXISTS` é idempotente, online, sem downtime.

---

## Resumo

9 decisões resolvidas — sem NEEDS CLARIFICATION pendentes. Phase
1 procede com:
- 1 `data-model.md` documentando entidade `user_facets` com campos.
- 1 contrato `contracts/facets-helper.md` (assinaturas + integração).
- 1 quickstart com cenários cobrindo backfill, primeira leitura,
  writes, recompute timing, multi-user.
