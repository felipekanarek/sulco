# Implementation Plan: Busca insensitive a acentos

**Branch**: `021-accent-insensitive-search` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/021-accent-insensitive-search/spec.md`

## Summary

Hoje a busca textual é case-insensitive mas sensível a acentos:

- `/` (home/coleção): `buildCollectionFilters` em
  [src/lib/queries/collection.ts:55-100](../../src/lib/queries/collection.ts)
  faz `lower(...) LIKE ?` em `records.artist`, `records.title`,
  `records.label`. Reusado por `queryCollection` (listagem) e
  `pickRandomUnratedRecord` (botão 🎲 da home, Inc 11).
- `/sets/[id]/montar`: `queryCandidates` em
  [src/lib/queries/montar.ts:107-110](../../src/lib/queries/montar.ts)
  faz `lower(...) LIKE ?` em `tracks.title`, `records.artist`,
  `records.title`, `tracks.fineGenre`.

SQLite não tem função nativa pra strip de diacríticos
(`unaccent`), e Turso não permite `load_extension`. Tentativa de
SQL puro com diacríticos seria inviável sem schema delta.

**Abordagem**: filtragem **JS-side pós-query**. Helper puro
`normalizeText(s)` em `src/lib/text.ts` (novo) faz `lowercase +
NFD + strip combining marks`. As 3 query functions deixam de
aplicar o filtro `text` no SQL e passam a aplicar em JS sobre o
resultado.

Trade-off aceito: puxar mais rows do DB e filtrar em memória.
Para escala atual (~2500 records, ~10k tracks por user),
performance é adequada (≤500ms — SC-002). Schema delta
(`searchBlob` físico) fica como Inc futuro se virar gargalo.

Sem schema delta. Sem novas Server Actions. Refator localizado:
1 helper novo + 3 callsites adaptados.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM (queries existentes), `String.prototype.normalize` (Unicode NFD nativo)
**Storage**: SQLite via libsql (Turso em prod). Sem mudanças no schema; filtro textual move-se de SQL para JS pós-query
**Testing**: validação manual via quickstart (alinhado com convenção do projeto)
**Target Platform**: Browser desktop + mobile (≤640px)
**Project Type**: Web application (Next.js monolito com RSC)
**Performance Goals**: ≤500ms latência total da query+filtro (SC-002) na escala atual; sem regressão perceptível
**Constraints**: scaling ceiling — abordagem JS-side é apropriada até ~5k records/user e ~50k tracks/user. Acima disso, migrar pra schema delta (`searchBlob` físico)
**Scale/Scope**: 1 user em prod com ~2500 records / ~10k tracks. ~2500 IDs+fields textuais carregados em memória (alguns KB) — overhead negligível

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: feature é puramente
  leitura. Nenhum write em campo AUTHOR ou em qualquer lugar.
- **II. Server-First por Padrão — OK**: queries continuam sendo
  RSC; helper `normalizeText` é função pura sem side-effects.
  Filtragem JS roda no servidor (RSC), não no client.
- **III. Schema é a Fonte da Verdade — OK**: zero schema delta.
  Schema continua single source.
- **IV. Preservar em Vez de Destruir — OK**: feature é apenas
  leitura. Nada é deletado nem modificado.
- **V. Mobile-Native por Padrão — OK**: ganho desta feature é
  **maior em mobile** (teclado virtual sem fluxo natural pra
  acento). Quickstart inclui cenário mobile (SC-003).

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/021-accent-insensitive-search/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões (JS-side vs schema, regex Unicode, separação de SQL/JS, post-filter ordering, limit timing)
├── contracts/
│   └── text-helper.md   # Contrato do `normalizeText` + integração nas 3 queries
├── quickstart.md        # Phase 1 — cenários manuais (incl. mobile + bidirecional + multi-user + escala)
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

Sem `data-model.md`: zero novas entidades.

### Source Code (repository root)

```text
src/
└── lib/
    ├── text.ts                           # NOVO — helper `normalizeText(s)` puro + `matchesNormalizedText(haystacks, query)` opcional pra DRY nos callsites
    ├── queries/
    │   ├── collection.ts                  # ALTERADO — `buildCollectionFilters` ganha flag `omitText` (default false); `queryCollection` chama com `omitText: true` e aplica filter JS pós-query
    │   └── montar.ts                      # ALTERADO — `queryCandidates` remove o LIKE textual SQL; aplica filter JS pós-query, antes de aplicar `limit` (que move pra JS também — necessário pra Inc 14 `rankByCuration` continuar funcionando)
    └── actions.ts                         # ALTERADO — `pickRandomUnratedRecord` adapta: SQL filters sem text → JS post-filter por text → random JS sobre resultado filtrado
```

**Structure Decision**: monolito Next.js. **3 arquivos
alterados** + **1 arquivo novo**:

- 1 helper puro (`text.ts`).
- `collection.ts`: separar text-filter em duas etapas (SQL non-text + JS text).
- `montar.ts`: idem; mover `limit` pro pós-filter JS.
- `actions.ts`: ajustar `pickRandomUnratedRecord` pra puxar IDs+fields-textuais, filtrar JS, escolher random JS.

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
