# Implementation Plan: Otimização de leituras Turso

**Branch**: `022-turso-reads-optimization` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/022-turso-reads-optimization/spec.md`

## Summary

Pacote consolidado em 3 frentes para mitigar estouro de cota Turso:

**A) Revert parcial Inc 21**:
- `queryCandidates`
  ([src/lib/queries/montar.ts](../../src/lib/queries/montar.ts)):
  re-aplicar `LIMIT 1000` SQL antes do text filter JS. Preserva
  Inc 18 (filtro accent-insensitive em JS continua), só limita
  o conjunto carregado do DB.
- `pickRandomUnratedRecord`
  ([src/lib/actions.ts:853](../../src/lib/actions.ts)): caminho
  rápido quando text vazio → `ORDER BY RANDOM() LIMIT 1` SQL
  (1 row read). Quando text presente, mantém JS post-filter
  (~2500 reads, caso minoria).

**B) Cache layer com `unstable_cache` + tag por user + TTL 300s**:
- 7 queries cacheadas (Clarifications Q1+Q2): `queryCollection`,
  `collectionCounts`, `listUserGenres`, `listUserStyles`,
  `listUserVocabulary`, `listUserShelves`, `getImportProgress`,
  `loadStatusSnapshot`.
- Cada query envelopada em wrapper que aplica `unstable_cache`
  com:
  - Cache key: nome da query + serialização determinística dos
    inputs (`userId`, filtros, etc.).
  - Tags: `[user:${userId}]` para invalidação grossa por user.
  - `revalidate: 300` (5min TTL).
- Server Actions de write existentes já chamam `revalidatePath`
  nas rotas afetadas — Next 15 invalida automaticamente caches
  associados às rotas. Adicional: chamamos `revalidateTag(`user:${userId}`)`
  no fim das actions críticas pra garantir invalidação cruzada
  (ex: `updateRecordStatus` afeta `queryCollection` em `/`,
  `collectionCounts`, `loadStatusSnapshot` — todos invalidados
  numa só tag).

**C) 2 índices estratégicos**:
- `records(user_id, archived, status)` composite — covers
  `WHERE userId = ? AND archived = ? AND status = ?` em
  `queryCollection`.
- `tracks(record_id, is_bomb)` composite — covers o lookup de
  bombs em `queryCollection`.
- Adicionados ao schema Drizzle + migration SQL aplicada via
  Turso shell em prod (`CREATE INDEX IF NOT EXISTS ...`,
  online).

Sem mudanças observáveis na UI. Feature é puramente backend.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM, `next/cache` (`unstable_cache`, `revalidateTag`)
**Storage**: SQLite via libsql (Turso em prod). 2 índices novos via migration SQL — sem mudança de tabelas/colunas
**Testing**: validação manual via quickstart + medição de row reads no dashboard Turso (antes/depois)
**Target Platform**: Vercel Hobby (free tier) + Turso free tier
**Project Type**: Web application (Next.js monolito com RSC)
**Performance Goals**: ≥80% redução em row reads na escala atual (~2500 records / ~10k tracks); latência percebida igual ou melhor
**Constraints**: Vercel Hobby Data Cache é per-region (sem replicação) — aceitável pra user solo BR; cold start ocasional vira cache miss
**Scale/Scope**: 1 user em prod (~2500 records, ~10k tracks). 7 queries cacheadas + 2 query callsites adaptados (queryCandidates, pickRandomUnratedRecord) + 2 índices novos

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: feature é puramente
  leitura/cache. Nenhum write em campo AUTHOR ou em qualquer
  lugar. Cache wrapper é transparente.
- **II. Server-First por Padrão — OK**: queries continuam RSC;
  cache é server-side via `unstable_cache` (Next 15 nativo).
  Sem client cache nem state global.
- **III. Schema é a Fonte da Verdade — OK**: schema delta
  apenas de **2 índices** (não tabelas/colunas). Schema continua
  single source. Migration aplicada via SQL direto pra contornar
  problema histórico do `db:push` (anti-pattern já documentado).
- **IV. Preservar em Vez de Destruir — OK**: nada deletado
  nem modificado. Cache invalidado ≠ deletado.
- **V. Mobile-Native por Padrão — OK**: ganho cross-device.
  UI inalterada — mesmo comportamento mobile e desktop, só mais
  rápido.

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/022-turso-reads-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões (cache key shape, tag granularity, invalidation strategy, índice composite ordering, limit edge cases)
├── contracts/
│   └── cache-wrappers.md  # Contrato de wrappers `unstable_cache` por query + integração com Server Actions de write
├── quickstart.md        # Phase 1 — validação manual incluindo medição de reads via dashboard Turso
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

Sem `data-model.md`: zero novas entidades; só índices.

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                          # ALTERADO — adiciona 2 índices: records(user_id, archived, status) + tracks(record_id, is_bomb)
├── lib/
│   ├── cache.ts                            # NOVO — helpers `cacheUser(fn, name)` + `revalidateUserCache(userId)` que envolvem unstable_cache com pattern padrão (tag, ttl, key)
│   ├── actions.ts                          # ALTERADO — `pickRandomUnratedRecord` ganha fast path; `getImportProgress` envolvido em cacheUser; Server Actions de write críticas chamam `revalidateUserCache(userId)` no fim
│   └── queries/
│       ├── collection.ts                   # ALTERADO — envolver `queryCollection` (com filters no cache key), `collectionCounts`, `listUserGenres`, `listUserStyles`, `listUserShelves` em cacheUser
│       ├── montar.ts                       # ALTERADO — `queryCandidates` re-aplica `LIMIT 1000` SQL antes do JS text filter
│       └── status.ts                       # ALTERADO — envolver `loadStatusSnapshot` em cacheUser
├── lib/queries-or-actions/listUserVocabulary  # ALTERADO em src/lib/actions.ts — envolver listUserVocabulary em cacheUser
└── (sem mudança em components/)
```

(Lista de arquivos consolidada acima — caminhos reais.)

**Migration SQL**:

```sql
-- Aplicar via Turso shell ou drizzle-kit (mesmo padrão Inc 010/012/013)
CREATE INDEX IF NOT EXISTS records_user_archived_status_idx
  ON records(user_id, archived, status);

CREATE INDEX IF NOT EXISTS tracks_record_is_bomb_idx
  ON tracks(record_id, is_bomb);
```

**Structure Decision**: monolito Next.js. **5 arquivos
alterados** + **1 arquivo novo** (`cache.ts`):

- `cache.ts`: helpers DRY pra envolver queries em `unstable_cache`.
- `schema.ts`: adicionar 2 entradas em `(t) => ({ ... })` blocks.
- `collection.ts`, `status.ts`, `actions.ts` (3 funções):
  envolver queries em `cacheUser(...)`.
- `montar.ts`: re-aplicar `LIMIT 1000` em `queryCandidates`.
- `actions.ts`: ajustar `pickRandomUnratedRecord` (fast path) +
  chamar `revalidateUserCache` em writes críticas.

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
