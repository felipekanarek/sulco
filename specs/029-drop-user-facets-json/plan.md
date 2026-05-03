# Implementation Plan: Cleanup pós-vocab — drop de colunas mortas

**Branch**: `029-drop-user-facets-json` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-drop-user-facets-json/spec.md`

## Summary

Remover as 5 colunas JSON em `user_facets` (`genresJson`, `stylesJson`, `moodsJson`, `contextsJson`, `shelvesJson`) que ficaram mortas pós-Inc 33 (todos os readers migraram pra `user_vocab` via `listVocab`). Schema delta de 5 colunas removidas + ajuste do tipo `UserFacets` (de 12 → 7 campos) + `getUserFacets` enxuto + `recomputeFacets` simplificado (remove 5 chamadas a agregadores no `Promise.all`, remove 5 fields no INSERT/onConflictDoUpdate). Deletar 3 helpers privados redundantes (`aggregateFacet`/`aggregateVocabulary`/`aggregateShelves`). Sem backfill. Migration prod via Turso shell DEPOIS do code deploy (ordem inversa do Inc 33 — código novo não depende das colunas, tabela velha tem colunas extras ignoradas).

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM (libsql dialect), libsql client
**Storage**: Turso (libsql) prod; SQLite local dev. Schema em [src/db/schema.ts](../../src/db/schema.ts) — **delta de 5 colunas removidas em `user_facets`**
**Testing**: Validação manual via [quickstart.md](./quickstart.md); medição via instrumentação `[DB]` em logs Vercel
**Target Platform**: Vercel Hobby (Lambda nodejs24.x), browsers modernos
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: zero impacto observável na UI; `recomputeFacets` ~5 SELECTs a menos por run
**Constraints**: zero gasto Vercel Hobby; ordem de deploy crítica (code primeiro, migration depois); reversível por revert + ALTER TABLE ADD COLUMN
**Scale/Scope**: 2 arquivos modificados (schema.ts + user-facets.ts); refator localizado; ~30-45min

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ feature toca apenas zona SYS materializada (`user_facets` é derivada de records/tracks). Zero impacto em campos AUTHOR. Sync continua sem tocar moods/contexts.
- **II — Server-First por Padrão**: ✅ refator interno em RSC helpers. Sem novos client components.
- **III — Schema é a Fonte da Verdade**: ✅ schema delta explícito em [src/db/schema.ts](../../src/db/schema.ts) (5 colunas removidas). Migration prod via Turso shell. Tipo `UserFacets` reflete schema 1:1.
- **IV — Preservar (Soft-Delete)**: ✅ feature remove dados materializados que são derivados (não originais). Reversível por revert + ALTER TABLE ADD COLUMN restaurando defaults vazios. `user_vocab` (fonte autoritativa pós-Inc 33) intocada.
- **V — Mobile-Native por Padrão**: ✅ refator backend puro. Zero impacto UI mobile.

**Resultado**: passa em todos os princípios.

## Project Structure

### Documentation (this feature)

```text
specs/029-drop-user-facets-json/
├── plan.md                       # Este arquivo
├── research.md                   # Phase 0 — decisões + alternativas (curto, low-risk)
├── data-model.md                 # Phase 1 — delta de user_facets
├── quickstart.md                 # Phase 1 — validação manual
└── checklists/
    └── requirements.md           # Já criado em /speckit.specify
```

Sem `contracts/` — não há helpers públicos novos, apenas ajustes em existentes.

### Source Code (repository root)

Mudanças confinadas a 2 arquivos:

```text
src/
├── db/
│   └── schema.ts                 # MOD: remover 5 colunas (genresJson/stylesJson/moodsJson/contextsJson/shelvesJson) da tabela userFacets. Mantém userId (PK), recordsTotal, recordsActive, recordsUnrated, recordsDiscarded, tracksSelectedTotal, updatedAt.
└── lib/queries/
    └── user-facets.ts            # MOD: ajustar tipo UserFacets (-5 campos); ajustar getUserFacets (remove parseJsonArray dos returns); ajustar recomputeFacets (remove 5 chamadas no Promise.all + 5 fields no INSERT/onConflictDoUpdate); remover helpers privados aggregateFacet, aggregateVocabulary, aggregateShelves; manter parseJsonArray helper se for usado em outro lugar (verificar via grep).
```

**Helpers que permanecem** (inalterados):
- `_repopulateVocab(userId)` — Inc 33 helper privado, continua re-populando `user_vocab` no recomputeFacets.
- `_aggregateVocabCounts(userId, column)` — Inc 33 privado, alimenta `_repopulateVocab` para moods/contexts.
- `_aggregateShelfCounts(userId)` — Inc 33 privado.
- `aggregateCounts(userId)` — privado, para counters de records.
- `aggregateTracksSelected(userId)` — privado, para `tracksSelectedTotal`.
- `applyRecordStatusDelta`, `applyTrackSelectedDelta`, `applyDeltaForWrite` — Inc 27 público, intactos.
- `getUserFacets`, `recomputeFacets` — públicos, signatures preservadas (apenas tipo retornado enxuga).

**Migration prod (sequência)**:

1. Code deploy primeiro (`vercel --prod --yes`).
2. Aplicar SQL em prod via `turso db shell sulco-prod`:
   ```sql
   ALTER TABLE user_facets DROP COLUMN genres_json;
   ALTER TABLE user_facets DROP COLUMN styles_json;
   ALTER TABLE user_facets DROP COLUMN moods_json;
   ALTER TABLE user_facets DROP COLUMN contexts_json;
   ALTER TABLE user_facets DROP COLUMN shelves_json;
   ```
3. Aplicar mesmo SQL em sqlite local (dev).
4. Smoke test pós-migration.

**Por que essa ordem**: código novo não lê as colunas — funciona perfeitamente com tabela velha (colunas extras são ignoradas pelo Drizzle SELECT que enumera só os campos do schema TS). Inverter (migration antes de deploy) quebra: código atual em prod ainda referencia `genresJson` etc. via `parseJsonArray(row.genresJson, [])`, e DROP COLUMN faria essa leitura falhar.

**Inversão alternativa** (descartada): rodar migration ANTES do code deploy seria possível só se o código atual já tolerasse colunas ausentes (não tolera — driver retorna undefined, parseJsonArray retorna fallback `[]`, mas isso significa pickers vazios temporariamente). Code-first elimina o problema.

**Structure Decision**: single-app Next.js App Router. Mudanças confinadas a `src/db/schema.ts` + `src/lib/queries/user-facets.ts`. Sem reorganização.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados** (todos baixos):

1. **Caller esquecido lendo `getUserFacets().genres`/etc**: pre-Inc 33, alguns callers acessavam essas listas. Inc 33 migrou todos pra `listVocab`. Mitigação: grep auditoria antes do build (tasks.md prescreve). Se aparecer, migrar pra `listVocab` antes de prosseguir.

2. **Build TS quebrar**: tipo `UserFacets` enxuga 5 campos. Se algum caller acessar campo removido, TS detecta. Mitigação: `npm run build` é gate antes do commit.

3. **Migration falhar em DROP COLUMN**: SQLite/libsql ≥3.35 suporta nativo. Turso usa versão moderna. Risco mínimo. Mitigação: rodar 1 ALTER por vez (5 statements) — se um falhar, abortar e investigar.

4. **`parseJsonArray` se torna dead code**: helper era usado pelos 5 campos removidos. Verificar se há outros callers; se não, deletar também. Tarefa T-XX cobre.

5. **Reversibilidade**: revert do commit + `ALTER TABLE user_facets ADD COLUMN ... DEFAULT '[]'` × 5. Custo baixo. Próximo `recomputeFacets` re-popularia (mas sem callers ativos, ficaria lá zumbi — aceitável durante rollback de emergência).
