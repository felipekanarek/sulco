---
description: "Task list — Inc 10 (Curadoria aleatória respeita filtros)"
---

# Tasks: Curadoria aleatória respeita filtros aplicados

**Input**: Design documents from `/specs/011-random-respects-filters/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Sem suíte automatizada no projeto. Validação via cenários
manuais do `quickstart.md` + `npm run build`.

**Organization**: Tasks agrupadas por user story (US1 = filtro único,
US2 = múltiplos AND, US3 = empty state contextual).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: pode rodar em paralelo
- **[US1/US2/US3]**: maps to user stories da spec

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve
  retornar `011-random-respects-filters`. Se não, abortar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: extrair helper de filtros + estender Server Action existente.
Todos os 3 user stories dependem destes 2 pontos.

- [X] T002 Extrair helper `buildCollectionFilters` em
  [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts).
  - Adicionar export `buildCollectionFilters(q: Pick<CollectionQuery, 'text' | 'genres' | 'styles' | 'bomba'>): SQL[]`
  - Mover linhas ~54-88 (text LIKE, genres `json_each`, styles `json_each`,
    bomba `exists`/`NOT EXISTS`) para dentro do helper. Helper retorna
    `SQL[]` com as conditions; chamada interna em `queryCollection`
    passa a fazer `conds.push(...buildCollectionFilters({...}))`.
  - Manter `queryCollection` chamando o helper para garantir paridade
    semântica (FR-004). Comportamento da listagem inalterado.

- [X] T003 Refatorar `pickRandomUnratedRecord` em
  [src/lib/actions.ts](../../src/lib/actions.ts) para aceitar filtros
  opcionais, conforme [contracts/server-actions.md](./contracts/server-actions.md):
  - Adicionar parâmetro opcional `filters?: { text?, genres?, styles?, bomba? }`.
  - Schema Zod interno `filtersSchema` (com `.default()` em cada campo
    e `.optional()` no objeto externo).
  - `safeParse` no input; inputs inválidos → `{ ok: false, error: 'Filtros inválidos.' }`.
  - Spread `buildCollectionFilters(parsedFilters)` em `conds` antes do
    `ORDER BY RANDOM() LIMIT 1`.
  - Garantir que `status='unrated'` e `archived=false` permanecem
    forçados internamente (FR-002, FR-003); status do filtro NÃO é
    aceito.
  - Importar `buildCollectionFilters` de `@/lib/queries/collection`.

**Checkpoint**: helper funcional e action recebe filtros. User stories
podem começar.

---

## Phase 3: User Story 1 — Sortear dentro de um filtro de estilo (Priority: P1) 🎯 MVP

**Goal**: 🎲 com `?style=Samba` ativo sorteia apenas entre Samba unrated.

**Independent Test**: cenário 1 do [quickstart.md](./quickstart.md) —
10 sorteios com `?style=Samba` produzem 100% de destinos com "Samba"
em `records.styles`.

- [X] T004 [US1] Adicionar prop `filters?: { text?, genres?, styles?, bomba? }`
  em [src/components/random-curation-button.tsx](../../src/components/random-curation-button.tsx):
  - Computar `hasActiveFilters` no client (helper inline, conforme
    [contracts/server-actions.md](./contracts/server-actions.md)).
  - Se `hasActiveFilters`: chamar `pickRandomUnratedRecord(filters)`;
    senão: chamar sem args (compat).
  - Empty state cliente: estado `emptyContext: 'global' | 'filtered' | null`,
    setado conforme `recordId === null` + `hasActiveFilters`.
  - Mensagens:
    - `'global'` → "Não há discos pra triar — todos já foram avaliados." (preservada).
    - `'filtered'` → "Nenhum disco unrated com esses filtros."

- [X] T005 [US1] Atualizar [src/app/page.tsx](../../src/app/page.tsx)
  para passar filtros lidos de searchParams ao `<RandomCurationButton>`:
  - Localizar `<RandomCurationButton />` (linha ~112).
  - Adicionar prop:
    `<RandomCurationButton filters={{ text, genres, styles, bomba }} />`.
  - **NÃO** passar `status` (FR-002 — sorteio sempre unrated, ignora
    filtro de status da URL).

**Checkpoint**: US1 entregue. Cenário 1 do quickstart passa.

---

## Phase 4: User Story 2 — Múltiplos filtros AND (Priority: P1)

**Goal**: 🎲 com `?style=MPB&q=caetano` respeita ambos os filtros.

**Independent Test**: cenário 2 + cenário 3 do quickstart (style+text e
bomba isolados).

**Note**: comportamento já garantido por construção — `buildCollectionFilters`
adiciona AND para cada filtro presente. Esta fase é validação.

- [X] T006 [US2] Validar via cenários 2 + 3 do quickstart que filtros
  combinados são aplicados corretamente. Smoke check da query gerada
  via `console.log` (debug temporário em
  [src/lib/actions.ts](../../src/lib/actions.ts) durante dev) — remover
  log antes do commit.

**Checkpoint**: US2 entregue.

---

## Phase 5: User Story 3 — Empty state contextual (Priority: P2)

**Goal**: filtro estreito que zera elegíveis exibe mensagem que indica
filtros (não acervo todo).

**Independent Test**: cenário 4 do quickstart.

**Note**: lógica já implementada em T004. Esta fase é validação visual.

- [X] T007 [US3] Validar cenário 4 do quickstart manualmente. Confirmar
  que a string mostrada quando há filtros aplicados é "Nenhum disco
  unrated com esses filtros." e que sem filtros volta a "Não há discos
  pra triar — todos já foram avaliados.".

**Checkpoint**: US3 entregue.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T008 Rodar `npm run build` no root e confirmar zero erros novos
  de TypeScript / lint. Verificar que `queryCollection` continua
  retornando os mesmos resultados (paridade — FR-004).

- [ ] T009 [P] Executar todos os 6 cenários do
  [quickstart.md](./quickstart.md) manualmente em `npm run dev`
  (cenários 1-3 P1, cenário 4 P2, cenários 5-6 regressão).

- [ ] T010 [P] Verificar via DevTools Network tab que tempo de resposta
  do clique 🎲 com filtros ativos ≤500ms (SC-004) em acervo de 2500+
  discos.

- [X] T011 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Incremento 10** de `## Roadmap > 🟢 Próximos` para
    `## Releases` com referência ao commit:
    `- **011** — Curadoria aleatória respeita filtros · 2026-04-27 · specs/011-random-respects-filters/ · botão 🎲 lê searchParams e passa pra pickRandomUnratedRecord; helper buildCollectionFilters compartilhado com queryCollection (FR-004); empty state contextual; status filter da URL ignorado`
  - Atualizar campo `**Última atualização**: 2026-04-27`.

- [X] T012 Commit final via `/speckit-git-commit` com mensagem
  `feat(011): curadoria aleatória respeita filtros aplicados`.

- [X] T013 Deploy: aplicar merge na main + push (Vercel auto-deploy).
  **Sem schema delta** — não precisa rodar nada em Turso prod.

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → T002 → T003 → T004 → T005 → (T006, T007 paralelos)
→ T008 → (T009, T010 paralelos) → T011 → T012 → T013

**Critical bottleneck**: T002 → T003 → T004 → T005 (helper, action,
componente, page) — sequenciais por dependência de import.

**Parallel windows**:
- T006 + T007 (validação manual): mesmo dev server, checks
  independentes
- T009 + T010 (quickstart manual + perf check): independentes

---

## Implementation Strategy

### MVP

T001-T005 entregam US1: sorteio respeita filtro único. US2/US3 são
proteções de regressão sobre o mesmo código (validação apenas).

### Sequência sugerida (~30min total)

1. **Setup + Foundational** (~10 min): T001-T003.
2. **US1 implementation** (~10 min): T004-T005.
3. **Validation** (~5 min): T006-T010.
4. **Polish + deploy** (~5 min): T011-T013.

---

## Format Validation

- [x] Todas tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T013
- [x] `[P]` em paralelizáveis (T009, T010)
- [x] `[US1]`/`[US2]`/`[US3]` em tasks de user story (T004-T007)
- [x] Sem labels em Setup/Foundational/Polish
- [x] Caminhos de arquivo nas tasks de código
