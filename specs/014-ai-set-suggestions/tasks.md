---
description: "Task list — Inc 1 (Briefing com IA em /sets/[id]/montar)"
---

# Tasks: Briefing com IA em /sets/[id]/montar

**Input**: Design documents from `/specs/014-ai-set-suggestions/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Sem suíte automatizada. Validação via cenários manuais
do `quickstart.md` + `npm run build`.

**Organization**: Tasks agrupadas por user story (US1 = primeira
geração, US2 = anti-duplicação, US3 = re-gerar com confirmação,
US4 = filtros respeitados).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: pode rodar em paralelo
- **[US1/US2/US3/US4]**: maps to user stories da spec

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve
  retornar `014-ai-set-suggestions`. Se não, abortar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: prompt builder + parser + extensão de `queryCandidates`.
Todos os 4 user stories dependem destes pontos.

**⚠️ CRITICAL**: nenhum US pode começar antes do checkpoint.

- [X] T002 [P] Criar [src/lib/prompts/set-suggestions.ts](../../src/lib/prompts/set-suggestions.ts)
  com função pura `buildSetSuggestionsPrompt(input)` conforme
  [contracts/ai-prompt.md](./contracts/ai-prompt.md):
  - Tipo `SetSuggestionsPromptInput` (briefing, setName, eventDate,
    location, setTracks[], candidates[]).
  - Estrutura multi-linha com headers `=== L1 ===` / `=== L2 ({N}) ===`
    / `=== L3 ({M} candidatos) ===` / `=== L4: Instrução ===`.
  - L3 com formato `trackId={id} | {artist} - {title} ({position}) | ...`
    incluindo todos os metadados disponíveis (gêneros/estilos/BPM/
    tom/energia/mood/contexto/comment/aiAnalysis truncados).
  - L4 instrução pedindo array JSON exclusivo entre fences markdown,
    5-10 sugestões, regras anti-hallucination/anti-duplicação,
    diversidade.
  - **Truncar briefing em 2000 chars** (mitiga U1 do speckit.analyze):
    `if (briefing && briefing.length > 2000) briefing = briefing.slice(0, 2000) + '... [truncado]'`.
    Evita custo descontrolado se DJ colar texto enorme.
  - Sem `'server-only'` (função pura, testável de qualquer lugar).

- [X] T003 [P] Criar `parseAISuggestionsResponse(text)` no mesmo
  arquivo [src/lib/prompts/set-suggestions.ts](../../src/lib/prompts/set-suggestions.ts):
  - Tenta extrair bloco entre fences markdown via regex
    `/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i`.
  - Fallback: regex inline `/(\[\s*\{[\s\S]*\}\s*\])/`.
  - JSON.parse + Zod schema:
    ```ts
    z.array(z.object({
      trackId: z.number().int().positive(),
      justificativa: z.string().min(1).max(500),
    })).min(0).max(20)
    ```
  - Retorna `{ ok: true, data } | { ok: false, error }`.
  - Mensagens de erro distintas: "Resposta sem bloco JSON
    detectável" vs "JSON inválido" vs "Estrutura inesperada".

- [X] T004 Estender `queryCandidates` em
  [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts)
  com 4º parâmetro opcional `opts?: { rankByCuration?: boolean; limit?: number }`:
  - Quando `opts?.rankByCuration === true`, adicionar ORDER BY com
    score de campos AUTHOR (decisão 2 do [research.md](./research.md)):
    `bpm IS NOT NULL + musicalKey IS NOT NULL + energy IS NOT NULL +
    json_array_length(moods) > 0 + json_array_length(contexts) > 0 +
    comment IS NOT NULL + aiAnalysis IS NOT NULL + rating IS NOT NULL +
    fineGenre IS NOT NULL` DESC, depois `tracks.updatedAt DESC`.
  - Quando `opts?.limit > 0`, aplicar `LIMIT`.
  - **Compat**: chamadas existentes (sem `opts`) mantêm comportamento
    atual. Confirmar via grep que callers atuais não passam o 4º arg.

**Checkpoint**: prompt builder + parser + queryCandidates estendida.
User stories podem começar.

---

## Phase 3: User Story 1 — Gerar primeira lista de sugestões (Priority: P1) 🎯 MVP

**Goal**: DJ clica "✨ Sugerir com IA" em set vazio → IA recebe
briefing + catálogo elegível → retorna 5-10 sugestões → cards
renderizados no painel.

**Independent Test**: cenário 1 do [quickstart.md](./quickstart.md).

- [X] T005 [US1] Criar Server Action `suggestSetTracks` em
  [src/lib/actions.ts](../../src/lib/actions.ts), conforme
  [contracts/server-actions.md](./contracts/server-actions.md):
  - Importar `enrichTrackComment` de `@/lib/ai`,
    `buildSetSuggestionsPrompt` + `parseAISuggestionsResponse` de
    `@/lib/prompts/set-suggestions`, `queryCandidates` +
    `listSetTracks` de `@/lib/queries/montar`.
  - Schema Zod com `setId: z.number().int().positive()`.
  - `requireCurrentUser` → user.
  - Ownership: select sets WHERE id=setId AND userId=user.id. Sem resultado → erro genérico.
  - Carrega: briefing/name/eventDate/location do set, montarFiltersJson, listSetTracks.
  - Computa `inSetIds` das faixas atuais.
  - Chama `queryCandidates(user.id, parsedFilters, inSetIds, { rankByCuration: true, limit: 50 })`.
  - **Curto-circuito** se candidates.length === 0: retorna erro
    "Nenhum candidato elegível com os filtros atuais. Relaxe os
    filtros e tente de novo." (sem chamar IA).
  - Monta prompt via `buildSetSuggestionsPrompt(...)`.
  - `Promise.race([enrichTrackComment(user.id, prompt), timeout(60_000)])`.
  - Em erro/timeout: propaga.
  - `parseAISuggestionsResponse(text)`. Falha → erro contextual.
  - **Filtragem defensiva**:
    - Remove trackIds não presentes em `candidates` (anti-hallucination).
    - Remove trackIds presentes em `inSetIds` (anti-duplicação,
      mesmo se IA ignorou regra).
    - Dedup por trackId.
    - Trunca em 10.
  - Se filtragem zera → erro "IA não retornou sugestões válidas — tente novamente.".
  - **Filtrar `candidates` retornados** (mitiga O1 do speckit.analyze):
    devolver apenas os candidatos referenciados nas suggestions
    finais, não o batch de 50 inteiro:
    `const usedCandidates = candidates.filter(c => suggestions.some(s => s.trackId === c.id))`.
    Reduz payload em ~80% (de ~50 → ~10 cards).
  - Return `{ ok: true, data: { suggestions, candidates: usedCandidates } }`.

- [X] T006 [US1] Estender [src/components/candidate-row.tsx](../../src/components/candidate-row.tsx)
  com prop opcional `aiSuggestion`:
  - `aiSuggestion?: { justificativa: string; added?: boolean }`
  - Quando presente, renderizar:
    - Badge `<span className="inline-block font-mono text-[10px] uppercase tracking-[0.12em] border border-accent text-accent px-2 py-0.5 mb-1">✨ Sugestão IA</span>` acima dos metadados.
    - Justificativa em itálico abaixo dos metadados, antes do botão "Adicionar":
      `<p className="font-serif italic text-[14px] text-ink-soft mt-2">{aiSuggestion.justificativa}</p>`
    - Quando `aiSuggestion.added`, botão "Adicionar" mostra "✓ Adicionada" desabilitado (com border `accent` ou similar).
  - **Compat**: card sem prop `aiSuggestion` mantém comportamento atual.

- [X] T007 [US1] Criar [src/components/ai-suggestions-panel.tsx](../../src/components/ai-suggestions-panel.tsx)
  como client component:
  - `'use client'`. Importa `useState`, `useTransition`, `useRouter`.
  - Props: `{ setId: number; aiConfigured: boolean }`.
  - Estado local: `PanelState` (`idle` | `generating` | `ready` | `error`) conforme [data-model.md](./data-model.md).
  - Header com título "Sugestões da IA" + botão "✨ Sugerir com IA":
    - `disabled={!aiConfigured || state.kind === 'generating'}`
    - `title={!aiConfigured ? 'Configure sua chave em /conta' : undefined}`
    - Tap target ≥ 44×44 px.
  - Handler `handleGenerate`:
    - Se `state.kind === 'ready'` E há `suggestions` com `added===false`:
      `window.confirm('Substituir as N sugestões pendentes por uma nova lista?')` — cancelar retorna sem chamar action.
    - `setState({ kind: 'generating' })`.
    - `startTransition(async () => {
        const res = await suggestSetTracks({ setId });
        if (res.ok) {
          const candidatesById = new Map(res.data.candidates.map(c => [c.id, c]));
          const suggestions = res.data.suggestions.map(s => ({ ...s, added: false }));
          setState({ kind: 'ready', suggestions, candidatesById });
        } else {
          setState({ kind: 'error', message: res.error });
        }
      })`.
  - Render condicional baseado em `state.kind`:
    - `idle`: vazio (só botão).
    - `generating`: botão diz "Sugerindo…", spinner ou texto.
    - `ready`: lista de `<CandidateRow track={candidatesById.get(s.trackId)!} aiSuggestion={{ justificativa: s.justificativa, added: s.added }} ... />`. Cada card renderiza com botão "Adicionar" que chama `addTrackToSet` e atualiza `added=true` localmente.
    - `error`: mensagem em vermelho com botão "Tentar de novo".
  - Handler `handleAdd(trackId)`:
    - Chama `addTrackToSet({ setId, trackId })` via `useTransition`.
    - Em sucesso, atualiza `state.suggestions` marcando `added=true` pra esse trackId. Card permanece visível (FR-008).
    - Em erro, mostra mensagem inline.

- [X] T008 [US1] Atualizar [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx)
  pra incluir o painel de sugestões:
  - Importar `getUserAIConfigStatus` de `@/lib/ai`.
  - Computar `aiConfigured = (await getUserAIConfigStatus(user.id)).configured` em paralelo com outros loaders (Promise.all).
  - Renderizar `<AISuggestionsPanel setId={set.id} aiConfigured={aiConfigured} />` em bloco vertical **abaixo do briefing** e **acima da listagem manual de candidatos**.

**Checkpoint**: US1 entregue. Cenário 1 do quickstart passa.

---

## Phase 4: User Story 2 — Anti-duplicação (Priority: P1)

**Goal**: IA NÃO sugere faixas que já estão em `set_tracks`.

**Independent Test**: cenário 3 do quickstart.

**Note**: comportamento já garantido por construção em T005 (prompt
L2 lista as faixas atuais + filtragem server-side remove duplicatas).
Esta fase é validação.

- [X] T009 [US2] Validar via cenário 3 do quickstart que sugestões
  geradas com set populado (≥5 faixas) NUNCA contêm trackIds que já
  estão em `set_tracks`. Confirmar via SQL/inspeção: 0 overlap.

**Checkpoint**: US2 entregue.

---

## Phase 5: User Story 3 — Re-gerar com confirmação (Priority: P2)

**Goal**: clicar "Sugerir" novamente quando há sugestões pendentes
exibe confirmação antes de substituir.

**Independent Test**: cenário 6 do quickstart.

**Note**: comportamento já implementado em T007 (handleGenerate
checa `suggestions.some(s => !s.added)` antes de chamar action).

- [X] T010 [US3] Validar via cenário 6 do quickstart que: (a)
  primeiro clique gera sem confirmação; (b) segundo clique com
  cards `added=false` visíveis dispara `window.confirm`; (c)
  cancelar preserva lista; (d) confirmar substitui lista.

**Checkpoint**: US3 entregue.

---

## Phase 6: User Story 4 — Filtros respeitados + curto-circuito catálogo zerado (Priority: P2)

**Goal**: filtros do `/montar` aplicam ao catálogo elegível enviado
à IA. Catálogo vazio = mensagem clara, zero tokens.

**Independent Test**: cenários 4 + 5 do quickstart.

**Note**: comportamento já implementado em T005 (passa
`montarFiltersJson` parseado pra `queryCandidates` + curto-circuito
em `candidates.length === 0`).

- [X] T011 [US4] Validar via cenário 4: 100% das sugestões
  pertencem a records matching o filtro aplicado.

- [X] T012 [US4] Validar via cenário 5: catálogo zerado exibe
  mensagem **antes** de qualquer chamada ao provider. Confirmar via
  DevTools Network: zero request HTTP pra IA quando filtros zeram.

**Checkpoint**: US4 entregue.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T013 Rodar `npm run build` no root e confirmar zero erros
  novos de TypeScript / lint. Atenção a:
  - Tipos do `queryCandidates` ainda compatíveis com callers atuais
    (T004 — sem opts continua funcionando).
  - `<CandidateRow>` aceita prop opcional sem quebrar usos
    existentes (T006).
  - `<AISuggestionsPanel>` é client component (`'use client'`),
    não vaza imports de `'server-only'`.
  - Imports de `enrichTrackComment` (`@/lib/ai`),
    `buildSetSuggestionsPrompt`/`parseAISuggestionsResponse`
    (`@/lib/prompts/set-suggestions`) resolvem.

- [X] T014 [P] Executar cenários 1, 2, 3, 4, 5 do
  [quickstart.md](./quickstart.md) manualmente em `npm run dev`
  (US1+US2+US4 P1+P2 cobertos).

- [X] T015 [P] Executar cenários 6, 7, 8 (re-gerar com confirmação,
  sem config, key revogada).

- [X] T016 [P] Executar cenário 9 (multi-user isolation) e cenário
  11 (set grande 60+ faixas, performance ≤30s).

- [X] T017 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Incremento 1** de `## Roadmap > 🟡 Médios` para
    `## Releases`:
    `- **014** — Briefing com IA em /sets/montar · 2026-04-28 · specs/014-ai-set-suggestions/ · botão "✨ Sugerir com IA" em /sets/[id]/montar; Server Action suggestSetTracks orquestra ownership + briefing + setTracks (L2 sem ceiling) + catálogo via queryCandidates estendida com rankByCuration (L3 ceiling 50, score = campos AUTHOR não-nulos); prompt em src/lib/prompts/set-suggestions.ts com parse JSON defensivo (fences/inline); reusa <CandidateRow> com prop aiSuggestion opcional (badge + justificativa); cards adicionados permanecem visíveis; sem batch (DJ adiciona uma a uma); IA propõe apenas complementos (nunca remove); curto-circuito quando catálogo elegível vazio; timeout 60s`
  - Atualizar campo `**Última atualização**`.

- [X] T018 Commit final via `/speckit-git-commit` com mensagem
  `feat(014): briefing com IA em /sets/montar`.

- [X] T019 Deploy: **sem schema delta** — pular ALTER TABLE em
  Turso. Apenas: `git checkout main && git merge --no-ff
  014-ai-set-suggestions && git push origin main`. Vercel
  auto-deploya (ou disparar manual via `vercel --prod --yes` se
  webhook atrasar).

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → (T002/T003 paralelos) → T004 → T005 → T006 → T007 → T008
→ T009 → T010 → T011 → T012 → T013 → (T014/T015/T016 paralelos)
→ T017 → T018 → T019

**Critical bottleneck**: T002/T003 (prompt+parser) → T004
(query estendida) → T005 (action) → T006 (extensão card) → T007
(panel) → T008 (page).

**Parallel windows**:
- **T002 + T003**: arquivo único compartilhado, mas funções
  independentes — podem ser escritas na mesma edição sem conflito.
- **T014/T015/T016**: validação manual em superfícies distintas.

**Não paralelizáveis**:
- T005-T008 tocam arquivos diferentes mas têm dependência forte
  (action → card → panel → page). Sequencial.

---

## Implementation Strategy

### MVP

T001-T008 entregam US1: geração funcional com cards visíveis e
botão "Adicionar" individual. US2/US3/US4 são validações sobre
código já presente em T005/T007.

### Sequência sugerida (~1.5 dias total)

1. **Setup + Foundational** (~3-4h): T001-T004.
2. **US1 implementation** (~5-7h): T005-T008.
3. **US2/US3/US4 validation** (~30min): T009-T012.
4. **Polish + deploy** (~1-2h): T013-T019.

---

## Format Validation

- [x] Todas tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T019
- [x] `[P]` em paralelizáveis (T002/T003 foundational; T014/T015/T016 polish)
- [x] `[US1]`/`[US2]`/`[US3]`/`[US4]` em tasks de user story (T005-T012)
- [x] Sem labels em Setup/Foundational/Polish
- [x] Caminhos de arquivo nas tasks de código
