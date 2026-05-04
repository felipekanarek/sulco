# Research — Inc 8 / 032: Filter UX rework + 5 novos filtros

**Phase**: 0
**Status**: 6 clarifications resolved (Q1-Q3 UX em 2026-05-03 Round 1; Q4-Q6 materialização em 2026-05-03 Round 2 após análise EXPLAIN).

## Decisão 1 — Ano via décadas (Q1=B)

**Decisão**: chips de décadas (50s/60s/70s/80s/90s/00s/10s/20s) em vez de range slider ou anos individuais.

**Rationale**:
- Alinhado com chip-style do resto (consistência visual).
- DJ raramente precisa filtrar precisão de "1972 a 1975" — décadas cobrem 95% dos casos.
- Sem componente UI novo (slider).
- Apenas décadas com ≥1 record aparecem (limpo).

**Implementação**: query `SELECT MIN(year), MAX(year) FROM records WHERE user_id=? AND archived=0 AND year IS NOT NULL` deriva range. Frontend gera chips de cada década dentro do range. Filtro SQL: `WHERE year BETWEEN <decadeStart> AND <decadeStart>+9` (OR entre múltiplas décadas selecionadas).

## Decisão 2 — Picker buttons + overlay (Q2=A)

**Decisão**: cada filtro = botão compacto (label + count badge) que abre overlay (desktop) ou drawer (mobile). Sem expansão inline na sidebar.

**Rationale**:
- Sidebar fica enxuta com 10+ filtros.
- Cada picker tem espaço dedicado pra chips + busca interna.
- Pattern conhecido (Notion, Airbnb).
- Reusa `<MobileDrawer>` (Inc 009) em mobile.

## Decisão 3 — Busca interna condicional (Q3=B)

**Decisão**: campo de busca textual aparece dentro do picker quando há >20 entries. Oculto quando ≤20.

**Rationale**:
- Pickers pequenos (Formato ~5, Décadas ~7, Prateleiras ~5-15) ficam limpos.
- Pickers grandes (Selo 500+, Estilo 170, País ~30) ganham busca quando precisa.
- Comportamento condicional consistente: threshold único de 20.

## Decisão 4 — Source de listas distintas (REVISADA Round 2)

**Decisão Round 1**: SELECT DISTINCT on-demand pra format/country/label.

**Decisão Round 2 (FINAL)**: **estender `user_vocab` (Inc 33)** com 3 kinds novos (`formats`, `countries`, `labels`).

**Rationale**:
- EXPLAIN QUERY PLAN em prod mostrou que `SELECT DISTINCT format FROM records WHERE user_id=?` exige `USE TEMP B-TREE FOR DISTINCT` — scan de ~2.6k records pra cada kind. **3 kinds × 2.6k = ~10k rows extras por load**, mesmo com cache request-scoped.
- Pré-Inc 8, home consome ~1.7k rows/load (pós-Inc 35). Adicionar +10k seria regressão de 6×.
- Materializar em `user_vocab` (Inc 33) reduz pra ~30 rows por kind via index direto.
- Pattern Inc 33 já maduro — reusa infra (applyVocabDelta + listVocab + recomputeFacets).
- Format/country/label são single-value por record (não JSON arrays) — diferente de Inc 35 (pivot tables com PK composta foram pra arrays). Aqui basta materializar contadores no `user_vocab` existente.
- Sync é o ÚNICO writer dos 3 fields (DISCOGS metadata) — hooks ficam confinados em `applyDiscogsUpdate` + `archiveRecord`.

**Alternativas consideradas (rejeitadas)**:
- **Lazy load (Server Action on-demand)**: 0 custo na home, mas ~2.6k rows lidas a cada picker aberto. UX flash de loading. Para DJs que abrem pickers frequentemente, custo equivalente ou pior.
- **3 pivot tables novas (estilo Inc 35)**: overkill — Inc 35 fez sentido pra arrays JSON via json_each scan; format/country/label são strings únicas, não precisam pivot.
- **Cache TTL longo (`unstable_cache` 1h)**: TTL traz drift quando sync adiciona record novo. Inaceitável.

## Decisão 5 — Schema delta no CHECK constraint do enum `kind`

**Contexto**: SQLite/libsql NÃO suporta `ALTER TABLE ... DROP/ADD CONSTRAINT`. Pra estender enum `kind` com 3 valores novos, opções:
- (a) Recriar tabela mantendo CHECK atualizado;
- (b) Recriar tabela SEM CHECK constraint;
- (c) Manter CHECK e contornar (impossível sem recriar).

**Decisão**: **(b) remover CHECK constraint completamente** (Q4=C).

**Rationale**:
- Drizzle TS schema (`text('kind', { enum: [...] })`) já valida em compile-time.
- Server Actions que chamam `applyVocabDelta(userId, kind, ...)` já validam via tipo TypeScript (`VocabKind`).
- Zod runtime validation cobre input externo se necessário.
- CHECK era extra-defensivo, não-crítico.
- Simplificação: 1 recriação one-time vs ter CHECK e refazer toda vez que adicionar kind futuro.

**Migration prod (5 statements DDL)**:
```sql
CREATE TABLE user_vocab_new (... sem CHECK ...);
INSERT INTO user_vocab_new SELECT * FROM user_vocab;
DROP INDEX user_vocab_user_kind_idx;
DROP TABLE user_vocab;
ALTER TABLE user_vocab_new RENAME TO user_vocab;
CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
```

Operação atômica em libsql. Idempotente: re-execução falha (tabela já existe sem CHECK) — sinal seguro.

## Decisão 6 — Strings vazias em format/country/label

**Contexto**: records do Discogs podem vir com `format = ""` ou `country = ""` (metadata incompleta).

**Decisão**: **tratar `""` como NULL** (Q5=A). Hook `applyVocabDelta` filtra strings vazias antes de chamar (`.length > 0` pós-trim).

**Rationale**:
- Vocab limpo: picker não mostra chip vazio (UX ruim).
- `_repopulateVocab` agrega via `WHERE col != '' AND col IS NOT NULL` (estendido em Q6).
- Filtro de records existing já filtra `WHERE col IN (?)` — string vazia nunca seria selecionada pelo picker, então records com `""` ficam fora naturalmente.

## Decisão 5 — `<FilterPicker>` genérico vs específicos

**Decisão**: 1 componente genérico `<FilterPicker>` reutilizado por 5 filtros multi-select (genres/styles/format/country/label/shelves). 1 variante específica `<DecadeFilterPicker>` pra Ano (estrutura sutilmente diferente: chips de décadas com label "70s" em vez de chips arbitrários).

**Rationale**:
- DRY entre 5 multi-selects similares.
- Decade picker tem semantics diferente (range derivado de int) — separar componente é mais claro.

**Props de `<FilterPicker>`**:
- `kind`: 'genres' | 'styles' | 'shelves' | 'format' | 'country' | 'label' (pra label e accent visual)
- `available`: array de strings
- `selected`: array de strings
- `onToggle`: (value) => void
- `onClose`: () => void
- `searchable`: boolean (calculated `available.length > 20`)

## Decisão 6 — URL search params

**Decisão**: parâmetros novos `format`, `shelf`, `decade`, `country`, `label` (multi-value via `?format=LP&format=7"`).

**Rationale**: consistência com `genre`/`style` existentes. URLSearchParams nativo suporta múltiplos valores. State externo / shareable.

## Decisão 7 — Listas distinct do mesmo arquivo de queries

**Decisão**: helpers novos em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts), próximos aos existing `listUserGenres`/`listUserStyles`/`listUserShelves` Inc 33.

**Rationale**: coesão temática (todas as queries de listagem da home num arquivo). Não vale criar arquivo separado pra 3 helpers.

## Decisão 8 — Sem indexes adicionais

**Decisão**: NÃO criar `records(user_id, archived, format)` ou similar pra cada novo filter.

**Rationale**:
- Index existente `records_user_archived_status_idx` cobre `WHERE user_id=? AND archived=?` — depois disso, scan dentro do range (~50-100 records pós-LIMIT) com filtro single-column é trivial.
- ~2.6k records não justifica overhead de indexes secundários.
- Reativo: se EXPLAIN pós-deploy mostrar gargalo, adicionar.

## Decisão 9 — Pickers em /sets/[id]/montar

**Decisão**: Inc 8 NÃO toca `/sets/[id]/montar`. Filtros novos aplicam APENAS na home `/`.

**Rationale**: spec já diz "fora do escopo" (FR-014). Aplicação em montar set fica como Inc futuro se houver demanda.

## Resumo

| # | Decisão | Trade-off |
|---|---|---|
| 1 | Ano via décadas (Q1=B) | Perde precisão; ganha consistência chip-style |
| 2 | Picker buttons + overlay (Q2=A) | Sidebar enxuta vs reaprendizado UX |
| 3 | Busca condicional >20 (Q3=B) | Pickers pequenos limpos; comportamento variável |
| 4 | **Materializar em user_vocab Inc 33 estendido** | Schema delta + hooks; pickers populam ~30 rows/kind cached vs ~2.6k DISTINCT |
| 5 | **Remover CHECK constraint do enum kind (Q4=C)** | Validação migra pra TS; recriação one-time |
| 6 | **Strings vazias `""` filtradas como NULL (Q5=A)** | Vocab limpo; picker sem chips vazios |
| 7 | Componente genérico `<FilterPicker>` | DRY entre 5 multi-selects |
| 8 | URL params multi-value | Shareable / preserved on refresh |
| 9 | Helpers em collection.ts | Coesão temática |
| 10 | Sem indexes adicionais | Escala atual aceita; reativo se gargalo |
| 11 | Apenas em `/` | Escopo focado |
