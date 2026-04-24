# Phase 1 — Data Model: Audio features via AcousticBrainz (005)

**Data**: 2026-04-24
**Referência de schema atual**: `src/db/schema.ts`

---

## Delta de schema

### `tracks` — adicionar 3 colunas

| Campo | Tipo | Nullable | Default | Descrição |
|---|---|---|---|---|
| `mbid` | `TEXT` | ✅ | `NULL` | MBID da recording (MusicBrainz). `NULL` = nunca resolvido. Preenchido uma vez e imutável após isso. |
| `audioFeaturesSource` | `TEXT` | ✅ | `NULL` | Origem do estado atual dos 4 campos de audio features. Valores: `NULL` (nunca enriquecido), `'acousticbrainz'` (valor vindo da fonte externa, não confirmado), `'manual'` (DJ editou pelo menos um dos 4 campos, bloco inteiro trancado). |
| `audioFeaturesSyncedAt` | `INTEGER` (timestamp) | ✅ | `NULL` | Epoch da última tentativa de enriquecimento, independente do resultado. Usado pra retry policy (≥30 dias). |

**Drizzle (adicionar em `tracks`)**:

```ts
// após moods/contexts
mbid: text('mbid'),
audioFeaturesSource: text('audio_features_source', {
  enum: ['acousticbrainz', 'manual'],
}),
audioFeaturesSyncedAt: integer('audio_features_synced_at', { mode: 'timestamp' }),
```

**Índice opcional** (consultado pelo worker):

```ts
audioFeaturesBacklogIdx: index('tracks_af_backlog_idx')
  .on(t.audioFeaturesSource, t.audioFeaturesSyncedAt),
```

**Migração do schema**: aplicável via `npm run db:push` (aditiva, sem
drop). SQLite aceita `ALTER TABLE ADD COLUMN` nativamente.

**Backfill (CRÍTICO pra Princípio I)**: imediatamente após o push,
rodar backfill one-shot marcando como `'manual'` toda track que já
tinha algum campo de audio features preenchido **antes** do 005
existir — caso contrário a primeira execução do enrich rotularia
dados legados do DJ como sugestão externa (violação visual de
Princípio I mesmo preservando bytes). Implementado como task
dedicada (ver `tasks.md` T004a) com SQL:

```sql
UPDATE tracks
SET audio_features_source = 'manual'
WHERE audio_features_source IS NULL
  AND (
    bpm IS NOT NULL
    OR musical_key IS NOT NULL
    OR energy IS NOT NULL
    OR (moods IS NOT NULL AND moods <> '[]')
  );
```

Idempotente — rodar múltiplas vezes é seguro (afeta apenas tracks com
`source IS NULL`).

---

### `syncRuns.kind` — estender enum

Adicionar valor `'audio_features'` ao enum existente:

```ts
kind: text('kind', {
  enum: ['daily_auto', 'manual', 'audio_features'],  // era ['daily_auto', 'manual']
}).notNull(),
```

**Uso**: cada execução da rotina (cron diário + trigger imediato)
persiste uma linha em `syncRuns` com `kind = 'audio_features'`. Campos
reutilizados:
- `newCount` → número de faixas atualizadas.
- `conflictCount` → número de faixas tentadas mas sem dado externo.
- `errorMessage` → agregado se ouve falha geral (ex. MB fora do ar).
- `outcome` → `'ok' | 'erro' | 'rate_limited'`.

---

## Entidades conceituais

### `TrackEnrichmentState` (derivada, não persistida)

Modelo lógico que a UI consome. Mapeado a partir dos campos persistidos
em `tracks`:

| Estado | Condição | UI |
|---|---|---|
| `empty` | `audioFeaturesSource IS NULL` AND `bpm/key/energy/moods` todos vazios | Campos vazios normais. |
| `suggested` | `audioFeaturesSource = 'acousticbrainz'` | **Badge "sugestão"** no bloco. Pelo menos 1 dos 4 campos preenchido. |
| `confirmed` | `audioFeaturesSource = 'manual'` | Sem badge. DJ assumiu os valores. |
| `tried_empty` | `audioFeaturesSource IS NULL` AND `audioFeaturesSyncedAt IS NOT NULL` | Sem badge. Indistinguível de `empty` na UI; só o worker vê a diferença (pra retry policy). |

### `EnrichmentRun` (alias em cima de `syncRuns`)

Visão lógica da tabela `syncRuns` quando filtrada por
`kind = 'audio_features'`. Não há tabela separada. Query:

```sql
SELECT * FROM sync_runs
WHERE user_id = ? AND kind = 'audio_features'
ORDER BY started_at DESC
LIMIT 1;
```

---

## Regras de escrita (null-guard)

**Pré-condição global**: antes da primeira execução do enrich, o
backfill descrito em "Backfill (CRÍTICO pra Princípio I)" já deve ter
rodado. Isso garante que qualquer track com valor legado tem
`audio_features_source = 'manual'` e está excluída do universo
elegível.

**Regra única pra bpm/musicalKey/energy/moods** (SQL template):

```sql
UPDATE tracks
SET
  bpm                     = COALESCE(bpm, ?),
  musical_key             = COALESCE(musical_key, ?),
  energy                  = COALESCE(energy, ?),
  moods                   = CASE
                              WHEN moods IS NULL OR moods = '[]' THEN ?
                              ELSE moods
                            END,
  mbid                    = COALESCE(mbid, ?),
  audio_features_source   = 'acousticbrainz',
  audio_features_synced_at = unixepoch()
WHERE id = ?
  AND audio_features_source IS NULL;
```

Notas:
- `COALESCE` garante que valor existente é preservado (null-guard por
  campo) — defesa em profundidade mesmo se backfill tiver lacuna.
- Cláusula `WHERE audio_features_source IS NULL` garante que tracks
  `'manual'` (DJ editou **ou** dados legados) são imunes. Combinada
  com o backfill, cobre Princípio I inclusive retroativamente.
- Tracks já com `source = 'acousticbrainz'` também são excluídas (já
  resolvidas). Não re-consultamos — AB está congelado.
- `moods` é JSON; comparação com `'[]'` cobre o default de
  `moods text('moods', { mode: 'json' }).default([])`.
- Se fonte externa não retornou dado pra determinado campo, passar
  `NULL` — `COALESCE(NULL, NULL) = NULL` preserva o estado atual.

### Transição pra `manual`

Quando DJ edita qualquer dos 4 campos via Server Action existente em
`actions.ts`, adicionamos set de `audio_features_source = 'manual'` na
mesma transação:

```sql
UPDATE tracks
SET bpm = ?, audio_features_source = 'manual'
WHERE id = ? AND record_id IN (SELECT id FROM records WHERE user_id = ?);
```

Racional: edição é edição de intenção. Mesmo que DJ digite o mesmo
valor sugerido, o ato de tocar no campo já expressa "eu revi". Source
vira `manual` e os outros 3 campos ficam **congelados** contra
futuras sugestões.

---

## Idempotência e ordem de operações

1. **Resolver MBID** (se `mbid IS NULL`):
   - Busca MB → atualiza só `tracks.mbid` e `audioFeaturesSyncedAt`.
   - Se não achou MBID, mantém `mbid = NULL` mas atualiza
     `audioFeaturesSyncedAt` (pra evitar re-try imediato).
2. **Buscar AB** (se `mbid IS NOT NULL` AND `audioFeaturesSource IS NULL`):
   - Fetch AB → se achou, compõe valores → executa UPDATE null-guarded
     (ver regra acima) com `source = 'acousticbrainz'`.
   - Se AB retornou 404 (sem dados pro MBID), atualiza só
     `audioFeaturesSyncedAt` e deixa source `NULL`.

Ordem garante que um MBID já resolvido não é re-buscado em MB. Dois
`UPDATE`s separados (um pra MBID, outro pra audio features) mantêm
cada operação simples e re-executável.

---

## Invariantes (teste explícito)

| Invariante | Origem | Teste |
|---|---|---|
| Campo autoral nunca sobrescrito | FR-006, Constituição Princípio I | `enrich-null-guard.test.ts`: pré-povoa `bpm = 120`, roda enrich com valor 118 do mock AB, verifica `bpm = 120`. |
| Edição manual trava bloco | FR-006b | `enrich-manual-lock.test.ts`: edita `bpm` via action, verifica `source = 'manual'`, roda enrich: verifica `musicalKey` (que estava vazio) continua vazio. |
| Cross-user isolation | SC-008, FR-017, FR-023 | `enrich-multi-user-isolation.test.ts`: dois users com discos idênticos, roda enrich pra user A, verifica que tracks do user B continuam intactas. |
| Retry só após 30 dias | FR-015 + research §7 | `enrich-backlog-idempotency.test.ts`: roda enrich, faxia faixa como `syncedAt = now - 5 days`, roda de novo, verifica que query não a incluiu. |
| Trigger imediato pós-import | FR-018a | `enrich-after-import.test.ts`: mocka MB/AB, importa disco novo, aguarda promise pendente, verifica que tracks receberam `source = 'acousticbrainz'`. |
