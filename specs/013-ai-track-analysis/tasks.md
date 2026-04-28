---
description: "Task list — Inc 13 (Análise da faixa via IA)"
---

# Tasks: Análise da faixa via IA

**Input**: Design documents from `/specs/013-ai-track-analysis/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Sem suíte automatizada. Validação via cenários manuais
do `quickstart.md` + `npm run build`.

**Organization**: Tasks agrupadas por user story (US1 = gerar
primeira vez, US2 = re-gerar com confirmação, US3 = editar manual,
US4 = apagar texto).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: pode rodar em paralelo
- **[US1/US2/US3/US4]**: maps to user stories da spec

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve
  retornar `013-ai-track-analysis`. Se não, abortar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema delta + prompt builder + types/query estendidos.
Todos os 4 user stories dependem destes pontos.

**⚠️ CRITICAL**: nenhum US pode começar antes do checkpoint.

- [X] T002 Adicionar coluna `aiAnalysis` em `tracks` no schema
  Drizzle em [src/db/schema.ts](../../src/db/schema.ts):
  - `aiAnalysis: text('ai_analysis')` posicionado logo após `comment`
    (zona AUTHOR agrupada). Nullable.

- [X] T003 Aplicar schema no DB local via sqlite3:
  ```bash
  sqlite3 sulco.db "ALTER TABLE tracks ADD COLUMN ai_analysis TEXT;"
  ```
  Verificar via `PRAGMA table_info(tracks)` que a coluna foi
  adicionada como `TEXT` nullable.

- [X] T004 Criar [src/lib/prompts/track-analysis.ts](../../src/lib/prompts/track-analysis.ts)
  exportando `buildTrackAnalysisPrompt(input): string`. Implementação
  conforme decisão 4 do [research.md](./research.md):
  - L1 essencial: `${artist} - ${album}${yearStr} - ${trackTitle} (${position})`
  - L2 contexto: pipe-separado com Gêneros/Estilos/BPM/Tom/Energia
    — só campos não-nulos. Se tudo nulo, usar `(sem metadados adicionais)`.
  - L3 instrução: 3 frases conforme research, cobrindo limite de
    500 chars, foco em sensação/uso em set, "não invente fatos".
  - Função pura, sem side-effects, sem 'server-only' (pode ser
    chamada de qualquer lugar).

- [X] T005 Estender o type `TrackData` em
  [src/components/track-curation-row.tsx](../../src/components/track-curation-row.tsx)
  adicionando `aiAnalysis: string | null;` logo após `comment`.

- [X] T006 Atualizar a query que monta tracks em
  [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx)
  pra incluir `aiAnalysis: tracks.aiAnalysis` no select. Confirmar
  que o objeto passado pra `<TrackCurationRow track={...} />` agora
  inclui `aiAnalysis` (TS catch automático após T005).

**Checkpoint**: schema aplicado, prompt builder pronto, type/query
estendidos. User stories podem começar.

---

## Phase 3: User Story 1 — Gerar análise pela primeira vez (Priority: P1) 🎯 MVP

**Goal**: DJ clica "✨ Analisar com IA" em track sem análise → IA
gera texto pt-BR → bloco "Análise" mostra resultado.

**Independent Test**: cenário 1 do [quickstart.md](./quickstart.md).

- [X] T007 [US1] Criar Server Action `analyzeTrackWithAI` em
  [src/lib/actions.ts](../../src/lib/actions.ts), conforme
  [contracts/server-actions.md](./contracts/server-actions.md):
  - Importar `enrichTrackComment` de `@/lib/ai`,
    `buildTrackAnalysisPrompt` de `@/lib/prompts/track-analysis`.
  - Schema Zod com `trackId: z.number().int().positive()`.
  - `requireCurrentUser` → user.
  - Query única JOIN `tracks → records` filtrando por
    `r.user_id = user.id` (ownership). Sem resultado → erro genérico
    "Faixa não encontrada.".
  - Buildar prompt com dados do track + record (artist, album, year,
    title, position, genres, styles, bpm, musicalKey, energy).
  - Chamar `enrichTrackComment(user.id, prompt)` envolto em
    **`Promise.race` com timeout de 30s** (mitiga finding I1 do
    speckit.analyze — `enrichTrackComment` do Inc 14 não tem timeout
    próprio, evitar DJ esperar até os 60s do Vercel). Em timeout:
    `{ ok: false, error: 'Provider não respondeu — tente novamente.' }`.
  - Propagar erro se `{ ok: false }`.
  - Validar texto não-vazio (trim). Vazio → "IA retornou resposta vazia
    — tente novamente.".
  - `db.update(tracks).set({ aiAnalysis: text.trim() }).where(eq(tracks.id, trackId))`.
  - `revalidatePath('/disco/' + recordId)`. Return
    `{ ok: true, data: { text: text.trim() } }`.

- [X] T008 [US1] Estender props de
  [src/components/track-curation-row.tsx](../../src/components/track-curation-row.tsx)
  adicionando `aiConfigured: boolean`.

- [X] T009 [US1] Em [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx),
  importar `getUserAIConfigStatus` de `@/lib/ai`, computar
  `aiConfigured = (await getUserAIConfigStatus(user.id)).configured`,
  e passar como prop pra cada `<TrackCurationRow aiConfigured={aiConfigured} />`.

- [X] T010 [US1] Implementar bloco "Análise" em
  [src/components/track-curation-row.tsx](../../src/components/track-curation-row.tsx)
  dentro do estado expandido (`open=true`), abaixo do bloco "Sua nota":
  - Header: `<p className="label-tech text-ink-mute">Análise</p>` +
    botão "✨ Analisar com IA" no canto direito.
  - Botão `disabled={!aiConfigured || isAnalyzing}` com
    `title={!aiConfigured ? 'Configure sua chave em /conta' : undefined}`.
  - Importar `analyzeTrackWithAI` de `@/lib/actions`.
  - Adicionar estado `isAnalyzing` (derivado de `useTransition`
    dedicado OU reusar o `isPending` existente — preferir dedicado
    pra evitar bloquear edição).
  - Handler `handleAnalyze`:
    - Se `local.aiAnalysis && local.aiAnalysis.trim().length > 0`:
      `window.confirm('Substituir análise existente?')` — cancelar
      retorna sem chamar action.
    - Caso ok ou campo vazio: `startAnalyzeTransition(async () => {
      const res = await analyzeTrackWithAI({ trackId: track.id });
      if (res.ok) setLocal(prev => ({...prev, aiAnalysis: res.data.text}));
      else setError(res.error); })`.
  - Textarea com `defaultValue={local.aiAnalysis ?? ''}` e
    `placeholder="Sem análise — clique no botão pra gerar com IA"`.
    Tap target ≥ 44×44 px. Estilo alinha com o textarea de `comment`
    existente.

**Checkpoint**: US1 entregue. Cenário 1 do quickstart passa.

---

## Phase 4: User Story 2 — Re-gerar análise existente (Priority: P1)

**Goal**: clicar "Analisar" em track com análise existente exibe
confirmação antes de sobrescrever.

**Independent Test**: cenário 2 do quickstart.

**Note**: comportamento já implementado dentro do `handleAnalyze`
(T010). Esta fase é validação visual + smoke check.

- [X] T011 [US2] Validar via cenário 2 do quickstart que o
  `window.confirm` aparece quando há texto, que cancelar não
  dispara action (verificar Network tab silencioso), e que
  confirmar substitui o texto.

**Checkpoint**: US2 entregue.

---

## Phase 5: User Story 3 — Editar análise manualmente (Priority: P2)

**Goal**: textarea com `aiAnalysis` é editável. Blur com mudança
salva via Server Action.

**Independent Test**: cenário 3 do quickstart.

- [X] T012 [US3] Criar Server Action `updateTrackAiAnalysis` em
  [src/lib/actions.ts](../../src/lib/actions.ts), conforme
  [contracts/server-actions.md](./contracts/server-actions.md):
  - Schema Zod com `trackId`, `recordId` (positive int) +
    `text: z.string().max(5000).nullable()`.
  - `requireCurrentUser` → user.
  - Ownership check: `WHERE id = trackId AND record_id IN (SELECT id FROM records WHERE user_id = ?)`.
  - Persistir `text` (já tratado como null pelo cliente).
  - `revalidatePath('/disco/' + recordId)`. Return `{ ok: true }`.

- [X] T013 [US3] Em [src/components/track-curation-row.tsx](../../src/components/track-curation-row.tsx),
  adicionar handler `saveAiAnalysis(next: string | null)` (otimista,
  reverte em erro — espelha `save()` existente). Conectar ao `onBlur`
  do textarea da análise:
  - `const v = e.target.value.trim();`
  - `const next = v === '' ? null : v;`
  - `if (next !== local.aiAnalysis) saveAiAnalysis(next);`
  - Importar `updateTrackAiAnalysis` de `@/lib/actions`.

**Checkpoint**: US3 entregue. Cenário 3 do quickstart passa.

---

## Phase 6: User Story 4 — Análise vazia ao limpar texto (Priority: P3)

**Goal**: apagar todo texto da análise resulta em campo NULL no DB.

**Independent Test**: cenário 4 do quickstart.

**Note**: comportamento já implementado em T013 (trim → null). Esta
fase é validação.

- [X] T014 [US4] Validar cenário 4 do quickstart manualmente.
  Confirmar via SQL que após apagar e blur, `tracks.ai_analysis = NULL`.

**Checkpoint**: US4 entregue.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T015 Atualizar `.specify/memory/constitution.md` (Princípio I):
  - Adicionar `aiAnalysis` à lista de campos AUTHOR de `tracks` —
    "todos os campos de curadoria de `tracks` (`selected`, `bpm`,
    `musicalKey`, `energy`, `moods`, `contexts`, `fineGenre`,
    `references`, `comment`, **`aiAnalysis`** — IA escreve via clique
    do DJ, DJ pode editar)".
  - Atualizar `Sync Impact Report` no topo do arquivo com versão
    `1.1.0` e racional.
  - Atualizar `CONSTITUTION_VERSION` se houver constante (verificar
    via grep).

- [X] T016 Rodar `npm run build` no root e confirmar zero erros
  novos de TypeScript / lint. Atenção a:
  - `TrackData` agora inclui `aiAnalysis` (T005). Tipo deriva via
    select da query (T006).
  - `<TrackCurationRow>` ganha prop `aiConfigured`. Verificar todos
    os call sites (provavelmente só `/disco/[id]/page.tsx`).
  - Imports de `enrichTrackComment` (do `@/lib/ai`) e
    `buildTrackAnalysisPrompt` (do `@/lib/prompts/...`) resolvem.

- [X] T017 [P] Executar cenários 1, 2, 3, 4 do
  [quickstart.md](./quickstart.md) manualmente em `npm run dev`
  (US1-US4 P1+P2+P3 completos).

- [X] T018 [P] Executar cenário 5 (sem config) e 6 (key revogada)
  do quickstart. Confirmar que botão fica desabilitado e que key
  inválida produz mensagem do mapeamento Inc 14.

- [X] T019 [P] Executar cenário 7 (multi-user isolation) e 8
  (faixa não-selected) do quickstart.

- [X] T020 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Incremento 13** de `## Roadmap > 🟢 Próximos` para
    `## Releases`:
    `- **013** — Análise da faixa via IA · 2026-04-28 · specs/013-ai-track-analysis/ · botão "✨ Analisar com IA" por faixa em /disco/[id]; campo novo tracks.ai_analysis (AUTHOR híbrido — IA escreve via clique do DJ, DJ pode editar); 2 Server Actions (analyzeTrackWithAI + updateTrackAiAnalysis); reusa enrichTrackComment do Inc 14; bloco sempre visível com placeholder; re-gerar com confirmação; bump constitucional 1.1.0`
  - Atualizar campo `**Última atualização**`.

- [X] T021 Commit final via `/speckit-git-commit` com mensagem
  `feat(013): análise da faixa via IA`.

- [X] T022 Deploy: aplicar schema delta em prod via Turso CLI ANTES
  do push:
  ```bash
  turso db shell sulco-prod "ALTER TABLE tracks ADD COLUMN ai_analysis TEXT;"
  ```
  Depois: `git checkout main && git merge --no-ff 013-ai-track-analysis && git push origin main`. Vercel auto-deploya (ou disparar manualmente via `vercel --prod --yes` se webhook atrasar, mesmo padrão Inc 010/011/012).

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010
→ T011 → T012 → T013 → T014 → T015 → T016 → (T017/T018/T019 paralelos)
→ T020 → T021 → T022

**Critical bottleneck**: T002→T003 (schema) → T004 (prompt) +
T005/T006 (type/query). Depois T007 (action de gerar) →
T008/T009 (prop aiConfigured) → T010 (UI principal). T010 é
simultâneamente T011/US2 (handler já trata confirmação).

**Parallel windows**:
- **T017/T018/T019**: validações manuais em diferentes superfícies,
  podem ser feitas na mesma sessão de dev server.
- T015 (constituição) é independente do código — poderia ser feito
  em paralelo a T002-T013, mas faz mais sentido fechar primeiro o
  código pra garantir que `aiAnalysis` realmente é AUTHOR híbrido
  como prometido.

**Não paralelizáveis**:
- T007/T010/T012/T013 tocam `actions.ts` ou `track-curation-row.tsx`
  — sequenciais por arquivo.

---

## Implementation Strategy

### MVP

T001-T010 entregam US1: gerar primeira análise. Inclui ownership,
prompt builder, action, prop nova, UI completa do bloco. US2 (T011)
é validação do que T010 já implementou.

### Sequência sugerida (~0.5-1 dia total)

1. **Setup + Foundational** (~1h): T001-T006.
2. **US1** (~2-3h): T007-T010 (action + UI completa).
3. **US2** (~10min): T011 validação.
4. **US3** (~1h): T012-T013 (action edição + handler blur).
5. **US4** (~5min): T014 validação.
6. **Polish + deploy** (~30-45min): T015-T022 (constituição,
   build, quickstart, BACKLOG, commit, deploy).

---

## Format Validation

- [x] Todas tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T022
- [x] `[P]` em paralelizáveis (T017/T018/T019)
- [x] `[US1]`/`[US2]`/`[US3]`/`[US4]` em tasks de user story (T007-T014)
- [x] Sem labels em Setup/Foundational/Polish
- [x] Caminhos de arquivo nas tasks de código
