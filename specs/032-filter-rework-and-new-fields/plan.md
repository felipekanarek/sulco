# Implementation Plan: Refatoração UX dos filtros + 5 filtros novos

**Branch**: `032-filter-rework-and-new-fields` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-filter-rework-and-new-fields/spec.md`

## Summary

Adiciona 5 filtros novos (Formato, Prateleira, Ano-décadas, País, Selo) na home `/` + refator UX da `<FilterBar>`: cada filtro vira **picker button compacto** (Q2=A) com label + count quando ativo. Click abre overlay/sheet com chips clicáveis (gênero/estilo/formato/prateleira/país/selo) ou botões de década (ano). Picker tem **busca textual interna condicional** (Q3=B) — aparece quando >20 entries. Genres/styles substituem lista expandida pelo mesmo padrão picker.

**Listas de valores materializadas via `user_vocab` (Inc 33 estendido)**: schema delta extends o enum `kind` com 3 valores novos (`formats`, `countries`, `labels`). Hooks em `applyDiscogsUpdate` (sync — single writer dos 3 campos) + `archiveRecord` aplicam `applyVocabDelta` pra manter materializado. Pickers populam via `listVocab(userId, kind)` cached — ~30 rows por kind contra index, sem scan. Genres/styles/shelves continuam reusando `user_vocab` Inc 33.

Ano via lista de décadas derivada de `MIN/MAX(year)` cached (1 query agregada por load — não precisa materializar).

URL search params: `format`, `shelf`, `decade`, `country`, `label`. Refator de `buildCollectionFilters` adiciona 5 conditions WHERE single-column.

**Schema delta MÍNIMO**: 1 ALTER no CHECK constraint do `user_vocab.kind` enum (de 5 → 8 valores).

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM (libsql), `next/navigation` (`useRouter`, `useSearchParams`).
**Storage**: Turso prod / SQLite local. Schema delta MÍNIMO em `user_vocab` (recriação pra remover CHECK constraint do enum kind).
**Testing**: Validação manual via [quickstart.md](./quickstart.md).
**Target Platform**: Vercel Hobby + browsers modernos.
**Project Type**: web (Next.js App Router single-app).
**Performance Goals**: filtro composto (5 kinds) ≤500ms percebidos; lista distinct on-demand ≤200ms.
**Constraints**: schema delta mínimo (recriação user_vocab); ordem de deploy crítica (migration + backfill antes de code deploy); sem regressão em filtros existing; reversível por revert + recriação inversa.
**Scale/Scope**: ~6 arquivos modificados (collection.ts, page.tsx, filter-bar.tsx, filter-bottom-sheet.tsx) + ~3-5 arquivos novos (filter-picker.tsx, novos helpers de listas distinct).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ apenas leitura de campos existentes. Zero write. Sem touch em AUTHOR/SYS.
- **II — Server-First por Padrão**: ✅ queries continuam server-side (RSC). Pickers são client components (interatividade JS necessária). URL search params como source-of-truth.
- **III — Schema é a Fonte da Verdade**: ✅ schema delta mínimo (`user_vocab` recriada sem CHECK constraint pra estender enum `kind` com 3 valores novos). Migration prod via Turso shell (5 statements DDL). Drizzle TS schema atualizado pra refletir.
- **IV — Preservar (Soft-Delete)**: ✅ feature aditiva. Nada destrutivo. Filtros antigos preservados.
- **V — Mobile-Native por Padrão**: ✅ pickers usam `<MobileDrawer>` (primitiva Inc 009/Inc 21) em mobile. `<FilterBottomSheet>` existing reusada. Tap targets ≥44px (chips e botões).

**Resultado**: passa em todos os princípios.

## Project Structure

### Documentation (this feature)

```text
specs/032-filter-rework-and-new-fields/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── checklists/requirements.md
```

Sem `contracts/` — não há helpers públicos com contratos formais; refator de `buildCollectionFilters` (existing) + helpers internos novos.

### Source Code

```text
src/
├── db/
│   └── schema.ts                    # MOD: enum `kind` em userVocab estende de 5 → 8 valores (+formats/countries/labels). Constraint CHECK removida (validação migra pro tipo TS).
├── lib/queries/
│   ├── collection.ts                # MOD: buildCollectionFilters ganha 5 novas conditions (format/shelf/decade/country/label). Tipo CollectionQuery ganha 5 campos. Helpers wrapper sobre listVocab: listUserFormats(userId)/listUserCountries(userId)/listUserLabels(userId). Helper getYearRange(userId) cached pra derivar décadas.
│   └── user-facets.ts               # MOD: _repopulateVocab estendido pra agregar 3 kinds novos (formats/countries/labels) via SELECT GROUP BY records.format/country/label (filtra "" via Q5=A).
├── lib/
│   └── discogs/
│       ├── apply-update.ts          # MOD: existing[0] SELECT estendido pra carregar oldFormat/oldCountry/oldLabel. INSERT path adiciona 3 applyVocabDelta novos quando created=true. UPDATE path faz diff per-field (single-value transitions handle null↔value↔value). Reaparição re-incrementa.
│       └── archive.ts               # MOD: archiveRecord SELECT inicial estendido pra format/country/label. Bulk decrement adiciona 3 applyVocabDelta novos.
├── components/
│   ├── filter-bar.tsx               # MOD: FilterContent vira layout de picker buttons (Q2=A). Cada filtro = botão compacto com label + count quando ativo. Click abre <FilterPickerOverlay> dedicado pro kind.
│   ├── filter-picker.tsx            # NOVO: componente generic <FilterPicker> recebendo (kind, available, selected, onToggle, onClose). Mostra chips clicáveis. Busca textual interna condicional (>20 entries — Q3=B). Usa <MobileDrawer side="bottom"> em mobile, popover absoluto desktop.
│   ├── decade-filter-picker.tsx     # NOVO: variante específica pro Ano. Chips de décadas (somente as com ≥1 record). Sem busca interna (poucos itens, ~6-8).
│   └── filter-bottom-sheet.tsx      # MOD: container externo no mobile permanece; conteúdo interno migra pra picker buttons (não chips inline expandidos).
└── app/page.tsx                     # MOD: ler 5 novos searchParams (format/shelf/decade/country/label), passar pra queryCollection + FilterBar.

scripts/
└── (sem novo script — backfill via recomputeFacets() pra cada user, mesmo padrão Inc 33)
```

**Helpers já existentes** (sem mudança):

- `listVocab(userId, kind)` em [src/lib/queries/user-vocab.ts](../../src/lib/queries/user-vocab.ts) — Inc 33 — usado pra Genres/Styles/Shelves.
- `<MobileDrawer>` em [src/components/mobile-drawer.tsx](../../src/components/mobile-drawer.tsx) — primitiva existing.
- `<FilterActiveChips>` em [src/components/filter-active-chips.tsx](../../src/components/filter-active-chips.tsx) — chips de filtros ativos com remove individual.

**Migration prod (sequência crítica — ordem similar Inc 32/33/35)**:

1. Aplicar SQL via `turso db shell sulco-prod`:
   ```sql
   CREATE TABLE user_vocab_new (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     term TEXT NOT NULL,
     ref_count INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
     PRIMARY KEY (user_id, kind, term)
   );
   INSERT INTO user_vocab_new SELECT * FROM user_vocab;
   DROP INDEX user_vocab_user_kind_idx;
   DROP TABLE user_vocab;
   ALTER TABLE user_vocab_new RENAME TO user_vocab;
   CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
   ```
2. Aplicar mesmo SQL em sqlite local (dev).
3. Para cada user em prod, rodar `recomputeFacets(userId)` pra popular os 3 novos kinds em `user_vocab` (pode rodar via script `scripts/_recompute-facets-all-users.mjs` ou disparar via cron one-time).
4. **Só então** mergear branch + push pra deploy.

**Por que essa ordem**: `recomputeFacets` precisa estar disponível com `_repopulateVocab` estendido (passo 3 depende do código deployado em local primeiro pra rodar via Node script). Alternativa: o script de backfill faz a agregação inline sem depender de código deployado — mais simples, mesmo padrão Inc 32/33.

**Indexes adicionais**: avaliar reativo. Pra ~2.6k records, filtros single-column (format/country/label/year/shelf) dentro do range `(user_id, archived, status)` existing são triviais. Decisão: NÃO criar indexes preventivos.

**Structure Decision**: single-app Next.js. Mudanças confinadas a queries (collection.ts), pages (page.tsx), e components (filter-bar + 2 novos pickers). Sem reorganização.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados**:

1. **UX rework é amplo**: substituir lista expandida por picker buttons impacta fluxo principal da home. DJ precisa reaprender layout. Mitigação: visual coherente (chips dentro do picker mantêm identidade); count badge no botão deixa estado visível.

2. **Picker overlay vs MobileDrawer**: 2 componentes potencialmente similares. Mitigação: `<FilterPicker>` detecta viewport via `matchMedia` (mesmo pattern Inc 21 ShelfPicker / Bug 15) e escolhe popover desktop OU drawer mobile.

3. **Lista de selos com 500+ entries**: search interna mitiga (Q3=B). Renderizar 500 chips pode pesar — limit de 200 visíveis + indicador "use a busca pra mais" se necessário.

4. **URL longa com 10+ filtros aplicados**: ~2KB worst case. Aceitável (navegadores suportam ~8KB).

5. **Listas de pickers populam via `listVocab` cached** (~30 rows por kind contra index `user_vocab_user_kind_idx`). Custo total dos 6 pickers em 1 load: ~180 rows lidas (vs ~10k pré-materialização). Reuso de pattern Inc 33.

6. **Schema delta na tabela `user_vocab`**: recriação completa pra remover CHECK constraint (SQLite não suporta DROP/ADD CONSTRAINT). Operação multi-step em prod (5 statements DDL) — fazer em janela curta + libsql executa em transação implícita.

7. **Hooks adicionais em path quente de sync** (`applyDiscogsUpdate`): + 3 chamadas `applyVocabDelta` (formats/countries/labels) ALÉM de Inc 33 + Inc 35 existing. Path de sync ganha overhead linear (cada record do Discogs tem +3 ops). Aceitável — sync é background, não user-facing.

8. **Décadas com 0 records em coleção pequena**: picker mostra apenas décadas com ≥1 record. Se coleção tiver só anos 70-90, mostra 3 chips (70s/80s/90s). Edge case OK.

9. **Reversibilidade**: revert do commit + recriação inversa do `user_vocab` (CREATE com CHECK + INSERT FROM SELECT + DROP + RENAME). Custo: ~5min via turso shell. Backfill restaurador necessário se reverter.

10. **Inc 35 já cobre filtros via index direto**: gêneros/estilos vêm de `record_genres`/`record_styles` pivot; novos filtros (format/country/label) vão direto contra coluna em records — index `(user_id, archived, status, imported_at DESC)` cobre. Sem regressão de performance.

11. **Strings vazias `""` em format/country/label** (records com metadata Discogs incompleta): hook filtra `length > 0` (Q5=A) — não incrementa user_vocab. Vocab limpo, picker não mostra chip vazio.
