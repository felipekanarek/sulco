---
description: "Task list — Inc 16 (UI rework sugestões IA inline)"
---

# Tasks: UI rework das sugestões IA (inline na lista de candidatos)

**Input**: Design documents from `/specs/015-ai-suggestions-inline/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Sem suíte automatizada. Validação via cenários manuais
do `quickstart.md` + `npm run build`.

**Organization**: Tasks agrupadas por user story (US1 = lista única
inline, US2 = reposicionamento, US3 = ignorar sugestões).

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve
  retornar `015-ai-suggestions-inline`. Se não, abortar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: refatorar visual do `<CandidateRow>` (extensão da prop
`aiSuggestion`) — essa mudança é shared entre todos os user stories.

- [X] T002 Estender visual de `<CandidateRow>` em
  [src/components/candidate-row.tsx](../../src/components/candidate-row.tsx)
  quando prop `aiSuggestion` está presente, conforme decisão 2 do
  [research.md](./research.md):
  - **Container** (`<article>` root): adicionar classes
    condicionais quando `aiSuggestion`:
    `border-2 border-accent/60 bg-paper-raised p-3 md:p-4 mb-2 rounded-sm`.
    Quando ausente, comportamento atual (sem moldura, padding default).
  - **Badge** "✨ Sugestão IA" (já existe): trocar de outline pra
    solid: `bg-accent text-paper px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] font-mono`
    (era `border border-accent text-accent`).
  - **Justificativa** (já existe): atualizar pra
    `font-serif italic text-[15px] text-ink leading-relaxed mt-2`
    (era `text-[14px] text-ink-soft`).
  - **Compat**: cards sem prop `aiSuggestion` mantêm aparência
    idêntica à atual.

**Checkpoint**: `<CandidateRow>` com aiSuggestion ganha destaque
visual proeminente. User stories podem começar.

---

## Phase 3: User Story 1 — Lista única com sugestões inline (Priority: P1) 🎯 MVP

**Goal**: cards de sugestão IA aparecem no topo da MESMA listagem
de candidatos (não em lista separada), com dedup garantido.

**Independent Test**: cenário 1 + cenário 3 (dedup) do
[quickstart.md](./quickstart.md).

- [X] T003 [US1] Criar [src/components/montar-candidates.tsx](../../src/components/montar-candidates.tsx)
  como client component, conforme [contracts/components.md](./contracts/components.md):
  - `'use client'`. Importa `useState`, `useTransition`, `useMemo`.
  - Props: `{ candidates, inSetIds, setId, aiConfigured }`.
  - Estado `SuggestionsState` (idle/generating/ready/error) — copiar
    estrutura do `<AISuggestionsPanel>` antigo do Inc 14.
  - Importar `suggestSetTracks` de `@/lib/actions`.
  - Importar `<CandidateRow>` de `./candidate-row`.
  - Importar tipo `Candidate` de `@/lib/queries/montar`.
  - **Header**: `<div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline pb-3 md:pb-4 border-b border-line mb-4 md:mb-6 gap-2">`
    contendo:
    - Título "Candidatos" + contador na esquerda (mesma estrutura
      atual em page.tsx).
    - Botões "✨ Sugerir com IA" (sempre quando aiConfigured) +
      "Ignorar sugestões" (apenas quando state.kind === 'ready').
    - Botões com `flex-wrap gap-2` pra mobile.
  - **Lista derivada** (useMemo):
    - Se state.kind === 'ready': computar `suggestedIds = new Set(state.suggestions.map(s => s.trackId))`,
      filtrar `commonCards = candidates.filter(c => !suggestedIds.has(c.id))`,
      mapear `suggestedCards` com `state.candidatesById.get(s.trackId)` (filtrar undefined).
    - Senão: `commonCards = candidates`, `suggestedCards = []`.
  - **Render** lista única `<ol>`:
    - Cards de sugestão primeiro com `<CandidateRow ... aiSuggestion={{ justificativa: card.justificativa }} />`.
    - Cards comuns sem prop aiSuggestion.
    - `inSetIds.has(c.id)` passa pra `alreadyIn`.
  - Handler `handleSuggest()`: confirmação se já há sugestões
    pendentes (Inc 14 pattern), startTransition + suggestSetTracks
    + setState ready/error.
  - Handler `handleIgnore()`: `setState({ kind: 'idle' })`. Sem
    confirmação (FR-006).

- [X] T004a [US1] Em [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx),
  **REMOVER** o `<AISuggestionsPanel>` antigo (linha entre briefing e
  filtros) + seu import:
  - Apagar `<AISuggestionsPanel setId={setId} aiConfigured={aiConfigured} />`.
  - Apagar `import { AISuggestionsPanel } from '@/components/ai-suggestions-panel';`.
  - Manter o cálculo de `aiConfigured` (será passado pro novo wrapper em T004b).

- [X] T004b [US1] No mesmo arquivo, **SUBSTITUIR** o `<section>`
  "Candidatos" (que envolve `<ol>{candidates.map(... <CandidateRow />)}</ol>`)
  pelo novo `<MontarCandidates>`:
  - Importar `import { MontarCandidates } from '@/components/montar-candidates';`.
  - Substituir todo o bloco `<section>` (header + ol + cards) por:
    ```tsx
    <MontarCandidates
      candidates={candidates}
      inSetIds={Array.from(inSetIds)}
      setId={setId}
      aiConfigured={aiConfigured}
    />
    ```
  - Remover import de `<CandidateRow>` se não houver outros usos
    no arquivo. Verificar via grep.
  - Manter `inSetIds` como Set no escopo da page (continua usado
    por outras partes — `<SetSidePanel>` etc).

**Checkpoint**: US1 entregue. Cenário 1 + 3 do quickstart passam.

---

## Phase 4: User Story 2 — Reposicionamento (Priority: P1)

**Goal**: ordem visual: briefing → filtros → painel sugestões → listagem.

**Independent Test**: cenário 2 do quickstart.

- [X] T005 [US2] Em [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx),
  reordenar JSX do filho `<div className="order-2 md:order-none flex flex-col gap-6 md:gap-8">`:
  - Ordem nova:
    1. Briefing block (se existir) — sem mudança.
    2. **Filtros** (mobile `<details>` collapsible + desktop `<div className="hidden md:block">`).
    3. **`<MontarCandidates>`** (substitui o painel antigo + section).
  - **Remover** a chamada antiga `<AISuggestionsPanel>` que estava
    entre briefing e filtros (já tirada em T004 implicitamente).
  - Confirmar visualmente que ordem renderizada bate com a spec
    (US2 acceptance scenario 1).

**Checkpoint**: US2 entregue.

---

## Phase 5: User Story 3 — Botão "Ignorar sugestões" (Priority: P2)

**Goal**: botão "Ignorar sugestões" reseta state e remove
destaque, sem confirmação.

**Independent Test**: cenário 4 do quickstart.

**Note**: comportamento já implementado em T003 (`handleIgnore` +
botão condicional ao state.kind === 'ready'). Esta fase é validação.

- [X] T006 [US3] Validar via cenário 4 do quickstart:
  - Botão "Ignorar sugestões" aparece apenas quando há sugestões
    geradas (`state.kind === 'ready'` com `suggestions.length > 0`).
  - Clicar reseta state pra idle em ≤200ms (sem round-trip).
  - Lista volta com TODOS os candidatos comuns (incluindo os que
    estavam como sugestão).
  - Botão "Ignorar" some.
  - Botão "Sugerir com IA" volta visível.
  - Re-clicar "Sugerir" não pede confirmação (não há sugestões
    pendentes).

**Checkpoint**: US3 entregue.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T007 Remover `<AISuggestionsPanel>` antigo:
  - Deletar arquivo
    [src/components/ai-suggestions-panel.tsx](../../src/components/ai-suggestions-panel.tsx).
  - Confirmar via `grep -rn "ai-suggestions-panel\|AISuggestionsPanel" src/`
    que não há referências remanescentes.

- [X] T008 Rodar `npm run build` no root e confirmar zero erros
  novos de TypeScript / lint. Atenção a:
  - `<MontarCandidates>` é client component (`'use client'`),
    não importa de `'server-only'`.
  - `<CandidateRow>` ainda compila com prop `aiSuggestion` opcional.
  - Page.tsx `<MontarCandidates>` recebe props corretas.
  - Nenhum import órfão (CandidateRow ou AISuggestionsPanel) em
    page.tsx após T004.

- [X] T009 [P] Executar cenários 1, 2, 3 do
  [quickstart.md](./quickstart.md) manualmente em `npm run dev`
  (US1+US2 P1).

- [X] T010 [P] Executar cenários 4, 5, 6 (ignorar, adições
  permanecem visíveis, re-gerar com confirmação).

- [X] T011 [P] Executar cenários 7, 8, 9, 10 (sem config,
  mobile, estado vazio, race).

- [X] T012 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Incremento 16** de `## Roadmap > 🟢 Próximos` para
    `## Releases`:
    `- **015** — UI rework sugestões IA inline (Inc 16) · 2026-04-28 · specs/015-ai-suggestions-inline/ · sugestões IA viram cards inline no topo da listagem de candidatos com moldura accent + bg paper-raised + badge solid + justificativa em destaque (text-[15px] text-ink); painel reposicionado abaixo dos filtros; botão "Ignorar sugestões" reseta state client-side ≤200ms; dedup de trackIds (sugestão vs comum) garante zero duplicação visual; <MontarCandidates> client wrapper substitui <AISuggestionsPanel> (deletado); zero schema delta, zero novas Server Actions`
  - Atualizar campo `**Última atualização**`.

- [X] T013 Commit final via `/speckit-git-commit` com mensagem
  `feat(015): UI rework sugestões IA inline na lista de candidatos`.

- [X] T014 Deploy: **sem schema delta** — pular ALTER TABLE em
  Turso. Apenas: `git checkout main && git merge --no-ff
  015-ai-suggestions-inline && git push origin main`. Vercel
  auto-deploya (ou disparar manual via `vercel --prod --yes`).

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 →
(T009/T010/T011 paralelos) → T012 → T013 → T014

**Critical bottleneck**: T002 (extensão visual CandidateRow) → T003
(MontarCandidates) → T004 (page.tsx). Cada step puxa o próximo.

**Parallel windows**:
- **T009/T010/T011**: validação manual em superfícies distintas.

**Não paralelizáveis**:
- T002, T003, T004 tocam arquivos sequencialmente dependentes.
- T005 reordena page.tsx — pode coincidir com T004 se feito
  numa única edição.

---

## Implementation Strategy

### MVP

T001-T004 entregam US1+US2 (lista única + reposicionamento). US3
é validação sobre código já implementado em T003.

### Sequência sugerida (~1-2h total)

1. **Setup + Foundational** (~10 min): T001-T002.
2. **US1 + US2 implementation** (~45min-1h): T003-T005.
3. **US3 validação** (~10min): T006.
4. **Polish + deploy** (~30-45min): T007-T014.

---

## Format Validation

- [x] Todas tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T014
- [x] `[P]` em paralelizáveis (T009/T010/T011)
- [x] `[US1]`/`[US2]`/`[US3]` em tasks de user story (T003-T006)
- [x] Sem labels em Setup/Foundational/Polish
- [x] Caminhos de arquivo nas tasks de código
