---
description: "Tasks for 003-faixas-ricas-montar"
---

# Tasks: Faixas ricas na tela "Montar set"

**Input**: Design documents em `specs/003-faixas-ricas-montar/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/candidate-card.md, quickstart.md

**Tests**: Testes de regressão manual via quickstart.md. Um teste
de integração opcional em T018 pra confirmar que o query retorna os
novos campos. Sem TDD estrito — feature é UI + 2 colunas em SELECT,
baixo risco.

**Organization**: Tasks agrupadas por user story pra entrega
incremental e testável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: roda em paralelo (arquivo diferente, sem dependência)
- **[Story]**: US1..US3 (mapeia para user stories da spec.md)
- Caminhos absolutos ao working dir do repo

## Path Conventions

Monolítico Next.js App Router: `src/` na raiz do repo.

---

## Phase 1: Setup

**Purpose**: nenhuma preparação externa — zero novas deps, zero env
vars, zero migração de schema. Phase 1 não tem tasks.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: expandir query + tipo Candidate + criar componente
Chip reusável. Bloqueia todas as user stories porque todas consomem
esses outputs.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta phase
terminar.

- [X] T001 Expandir tipo `Candidate` em `src/lib/queries/montar.ts`
  com 2 campos novos: `references: string | null` (de `tracks.references`)
  e `recordNotes: string | null` (de `records.notes`). Ver
  data-model.md §"Tipo de aplicação alterado".
- [X] T002 Expandir SELECT de `queryCandidates` em
  `src/lib/queries/montar.ts` com `tracks.references` e
  `records.notes`. Mantém o mapping + tipos. Nenhuma mudança nos
  filtros aplicados.
- [X] T003 [P] Criar componente `<Chip>` em `src/components/chip.tsx`
  com 3 variants (`mood`, `context`, `ghost`) conforme
  contracts/candidate-card.md §"Chip component". Tokens de cor
  existentes (`--accent-soft`, `--line`, etc.).

**Checkpoint**: Candidate type retorna todos os campos necessários;
Chip component pronto pra uso.

---

## Phase 3: User Story 1 — Card compacto rico (Priority: P1) 🎯 MVP

**Goal**: o DJ olha o card de candidato e vê em um piscar de olhos:
rating destacado, Bomba, fineGenre, comment truncado, chips de moods
e contexts distinguíveis — tudo sem precisar expandir.

**Independent Test**: com ≥10 candidatos preenchidos, DJ consegue
escanear e avaliar 5 faixas em 15s sem abrir `/disco/[id]`.

### Implementation

- [X] T004 [US1] Refatorar `RatingGlyph` em
  `src/components/candidate-row.tsx` conforme FR-004: `+` em
  `text-ink-mute`, `++` em `text-ink`, `+++` em `text-accent
  font-semibold`. Rating=null não renderiza nada (remove o "—"
  atual).
- [X] T005 [US1] Adicionar label `fineGenre` inline no card
  compacto (linha abaixo de artista/recordTitle) em
  `src/components/candidate-row.tsx`, apenas quando preenchido.
  Estilo `label-tech` sutil, cor `ink-soft`.
- [X] T006 [US1] Substituir a linha atual de moods+contexts join
  (`[...moods, ...contexts].slice(0,4).join(' · ')`) por chips
  distintos: `<Chip variant="mood">` pra moods e
  `<Chip variant="context">` pra contexts, em
  `src/components/candidate-row.tsx`.
- [X] T007 [US1] Implementar overflow `+N mais` em
  `src/components/candidate-row.tsx`: cada grupo (moods e contexts
  separadamente) limita em 4 chips visíveis; se houver mais, adiciona
  `<Chip variant="ghost">+N mais</Chip>` como último chip.
- [X] T008 [US1] Adicionar linha de `comment` truncado no card
  compacto em `src/components/candidate-row.tsx`: `<p class="font-serif
  italic text-[13px] line-clamp-1" title={candidate.comment}>"{comment}"</p>`.
  Aparece apenas quando preenchido.
- [X] T009 [US1] Marcação "já na bag" em
  `src/components/candidate-row.tsx`: quando `inSet=true`, adicionar
  classes `border-l-2 border-l-ok bg-ok/5` no `<li>` e substituir o
  botão `+` por badge `✓` + botão "remover" inline. Usar tokens
  `--ok` existentes.
- [X] T010 [US1] Integrar `removeTrackFromSet` (já existe em
  `src/lib/actions.ts`) no botão "remover" do card em
  `src/components/candidate-row.tsx`. Após sucesso: `setInSet(false)`,
  `router.refresh()`. Reusa o mesmo padrão de tratamento de erro do
  `add`.

**Checkpoint**: card compacto mostra todos os campos (US3 cobre
distinção visual do comment separadamente); adicionar/remover da bag
preserva o fluxo.

---

## Phase 4: User Story 2 — Toggle expand/collapse + modo expandido (Priority: P1)

**Goal**: DJ clica chevron pra ver os detalhes completos de uma
faixa (references, shelfLocation com 📍, notes do disco, comment
full, todos os chips) e pode colapsar de volta a qualquer momento.

**Independent Test**: DJ expande/colapsa 3 cards em sequência; cada
toggle é instantâneo (≤100ms); estados individuais preservados entre
interações.

### Implementation

- [X] T011 [US2] Adicionar estado `const [expanded, setExpanded] =
  useState(false)` em `src/components/candidate-row.tsx`.
- [X] T012 [US2] Implementar botão chevron `▸` / `▾` em
  `src/components/candidate-row.tsx` com atributos a11y:
  `aria-expanded={expanded}`,
  `aria-controls={\`candidate-${candidate.id}-details\`}`,
  `aria-label` dinâmico ("Expandir detalhes" / "Recolher detalhes").
  Posicionado na coluna de ação, ao lado do botão add/remove.
- [X] T013 [US2] Renderizar bloco expandido condicional
  (`{expanded ? (...) : null}`) em
  `src/components/candidate-row.tsx` com grid 2 colunas:
  - Coluna esquerda: chips completos (wrap livre), references,
    comment full (whitespace-pre-line)
  - Coluna direita: shelfLocation com ícone 📍, recordNotes
    (whitespace-pre-line, itálico serif)
  - `id={\`candidate-${candidate.id}-details\`}` pra casar com o
    aria-controls do toggle
- [X] T014 [US2] Verificar em
  `src/components/candidate-row.tsx` que as operações `add`/`remove`
  (da bag) NÃO chamam `setExpanded` — estado de expansão preservado
  através de add/remove conforme FR-014b.

**Checkpoint**: toggle expand/collapse funciona; modo expandido
mostra tudo; add/remove não mexe em expansion.

---

## Phase 5: User Story 3 — Comment visualmente distinto (Priority: P2)

**Goal**: comment pulsa visualmente na tela compacto pra o DJ notar
as anotações importantes sem precisar expandir ("lembra Floating
Points").

**Independent Test**: olhar a lista e identificar em 2s quais
candidatos têm comment preenchido vs quais não têm.

### Implementation

- [X] T015 [US3] Ajustar estilo do comment em
  `src/components/candidate-row.tsx` (T008 criou a linha base):
  garantir `font-serif italic text-[13px] text-ink-soft` com aspas
  pra distinguir do texto técnico `label-tech mono`. Comment vazio
  omite a linha (não aparece "—" nem espaço reservado).

**Checkpoint**: comment preenchido "salta" visualmente do resto do
card; ausência de comment reduz altura do card.

---

## Phase 6: Polish

- [X] T016 [P] Atualizar
  `docs/quickstart-walkthrough.md` passo 5 ("Criar e montar set")
  incluindo os novos campos do card expandido.
- [X] T017 [P] Atualizar `CLAUDE.md` seção "Histórico de decisões"
  com linha sobre Chip component + modo compact/expand em candidato.
- [X] T018 Escrever `tests/integration/candidate-fields.test.ts`:
  valida que `queryCandidates` retorna `references` e `recordNotes`
  corretamente + ambos são scoped por userId (isolamento).
- [X] T019 Executar `npx tsc --noEmit`, `npm test`,
  `npm run test:constitution` — confirmar zero regressão.
- [X] T020 Deploy: `vercel deploy --prod --yes`; smoke test manual
  em `/sets/<id>/montar` com 1 candidato real (owner + amigo).
- [X] T021 Rodar `specs/003-faixas-ricas-montar/quickstart.md` inteiro
  (11 passos) e marcar checkpoints.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: vazio; nada a fazer
- **Foundational (P2)**: blocks all user stories (todas consomem o
  tipo Candidate expandido e/ou o Chip component)
- **US1 (P3)**: depende de Foundational
- **US2 (P4)**: depende de Foundational + US1 (já que compartilha o
  mesmo arquivo `candidate-row.tsx` e o bloco expandido precisa dos
  campos do Candidate type expandido)
- **US3 (P5)**: depende de US1 (T008 já cria a linha; T015 só
  estiliza)
- **Polish (P6)**: depende de todas anteriores

### Parallel Opportunities

- T003 (Chip) paralelo com T001+T002 (query) dentro de Foundational
- Todas as tasks de US1 (T004–T010) editam o mesmo arquivo
  (`candidate-row.tsx`) — SEQUENCIAIS; exceto pela dependência
  estrita, podem ser agrupadas em um único commit
- US2 também edita mesmo arquivo — sequencial em relação a US1
- T016 e T017 (polish docs) paralelos

### Within Each User Story

- US1 ordem natural: rating (T004) → fineGenre (T005) → chips
  (T006→T007) → comment (T008) → já na bag visual (T009) → remove
  handler (T010)
- US2 ordem: state (T011) → toggle (T012) → bloco expandido
  (T013) → verificar preservação (T014)

---

## Implementation Strategy

### MVP (Foundational + US1 + US2)

1. Phase 2 Foundational: T001-T003
2. Phase 3 US1: T004-T010
3. Phase 4 US2: T011-T014
4. Polish parcial: T019 + T020
5. **STOP**: validar manualmente na tela de montar set

US3 pode entrar em um commit seguinte, pequeno; Polish completo
(testes + docs) depois.

### Incremental

- Stage 1: Foundational + US1 (compact rico) → deploy
- Stage 2: + US2 (expand/collapse) → deploy
- Stage 3: + US3 + Polish → deploy final

### Notes

- Todos os edits no mesmo arquivo `candidate-row.tsx` — commitar ao
  final de cada user story (não por task) pra evitar quebras
  intermediárias no build.
- `removeTrackFromSet` já existe em `src/lib/actions.ts`; apenas
  reutilizar.
- Teste de regressão do Princípio I pode ser feito via inspeção
  manual do DB antes/depois (campos autorais). Testes automatizados
  do Princípio I já cobrem via `npm run test:constitution`.
