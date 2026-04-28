---
description: "Task list — Inc 15 (Editar briefing/set após criação)"
---

# Tasks: Editar briefing e dados do set após criação

**Input**: Design documents from `/specs/016-edit-set-fields/`
**Prerequisites**: plan.md, spec.md, contracts/, research.md, quickstart.md

**Tests**: Sem suíte automatizada. Validação via cenários manuais
do `quickstart.md` + `npm run build`.

**Organization**: Tasks agrupadas por user story (US1 = editar
briefing, US2 = editar nome/data/local, US3 = cancelar). US1 e
US2 compartilham 100% do mesmo código (mesmo form, mesmos
campos). US3 é validação de comportamento já implementado.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve
  retornar `016-edit-set-fields`. Se não, abortar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: nenhum schema delta nem nova action — `updateSet` já
existe em `src/lib/actions.ts:945`. Esta fase é apenas validação
prévia.

- [X] T002 Verificar via grep que `updateSet` existe e tem partial
  update + ownership check + revalidatePath nas 3 rotas:
  ```bash
  grep -A 30 "export async function updateSet" src/lib/actions.ts
  ```
  Confirmar que a action aceita name/eventDate/location/briefing
  como opcionais e não requer mudanças. Se algo estiver fora do
  esperado, abortar e reabrir spec.

**Checkpoint**: action confirmada. User stories podem começar.

---

## Phase 3: User Story 1 + 2 — Form de edição (Priority: P1 + P2) 🎯 MVP

**Goal**: DJ clica botão "✏️ Editar set" → modal abre com 4 campos
pré-preenchidos → DJ edita briefing (e/ou outros) → salva → modal
fecha → página recarrega com valores novos.

**Independent Test**: cenário 1 (briefing) + cenários 2-4 (nome/
data/local) do [quickstart.md](./quickstart.md).

**Note**: US1 (editar briefing) e US2 (editar outros campos)
compartilham 100% do código — um único form com 4 campos cobre
ambas. Tasks abaixo são para o conjunto.

- [X] T003 [US1] Criar [src/components/edit-set-modal.tsx](../../src/components/edit-set-modal.tsx)
  como client component, conforme [contracts/components.md](./contracts/components.md):
  - `'use client'`. Importa `useState`, `useEffect`, `useRouter`.
  - Importa `updateSet` de `@/lib/actions`.
  - Props: `{ set: { id, name, eventDate, location, briefing } }`.
  - Estado local: open, name, eventDate (string formatada),
    location, briefing, isPending, error.
  - Helper `formatForInput(d: Date | null): string` — converte
    `Date` pra `YYYY-MM-DDTHH:mm` em hora local (decisão 3 do
    [research.md](./research.md)).
  - `useEffect` reseta state local pros valores de `set` toda
    vez que `open` muda de false→true (decisão 7).
  - Validação client-side `isValid`: name não-vazio + ≤200,
    briefing ≤5000.
  - Handler `submit()`: chama `updateSet({...})` com partial
    payload, em sucesso `setOpen(false)` + `router.refresh()`.
  - Estrutura render condicional: botão quando fechado, modal
    fullscreen com `role="dialog"`, `aria-modal="true"` quando aberto.
  - Modal: overlay `fixed inset-0 bg-ink/60`, dialog
    `bg-paper border border-line max-w-[640px]`, ESC fecha
    via onKeyDown, clique no overlay (não dialog) fecha,
    `autoFocus` no input "Nome", contador de chars no briefing.
  - Botões "Cancelar" e "Salvar" no rodapé. Salvar
    `disabled={!isValid || isPending}`. Texto "Salvando…" durante
    pending.
  - Tap targets ≥ 44×44px nos botões (alinha com Inc 009).

- [X] T004 [US1] Atualizar [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx):
  - Importar `import { EditSetModal } from '@/components/edit-set-modal';`.
  - Inserir `<EditSetModal set={{ id, name, eventDate, location, briefing }} />`
    no header da página, próximo ao título do set (decisão 2 do
    research). Usar layout flex pra alinhar com elementos
    existentes.
  - Confirmar via grep que `set` (objeto) carregado pelo
    `loadSet` tem todos os campos necessários (id, name,
    eventDate, location, briefing). Provavelmente já tem.

**Checkpoint**: US1 + US2 entregues. Cenários 1-4 do quickstart
passam.

---

## Phase 4: User Story 3 — Cancelar edição (Priority: P3)

**Goal**: clicar "Cancelar" fecha modal sem persistir; reabrir
mostra valores ATUAIS do DB (não os edits cancelados).

**Independent Test**: cenário 5 do quickstart.

**Note**: comportamento já implementado em T003 (Cancel button
chama `setOpen(false)` sem chamar action; useEffect reseta state
ao reabrir). Esta fase é validação.

- [X] T005 [US3] Validar via cenário 5 do quickstart:
  - Editar 2-3 campos sem salvar.
  - Clicar Cancelar (ou ESC ou clicar no overlay).
  - Confirmar via SQL que valores no DB estão intactos.
  - Reabrir modal — campos devem mostrar valores ORIGINAIS,
    não os edits descartados (validação do useEffect de reset).

**Checkpoint**: US3 entregue.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T006 Rodar `npm run build` no root e confirmar zero erros
  novos de TypeScript / lint. Atenção a:
  - `<EditSetModal>` é client (`'use client'`), sem imports de
    'server-only'.
  - `updateSet` chamada com payload partial (campos nulos
    enviados explicitamente).
  - Import de `formatForInput` interno (helper local).

- [X] T007 [P] Executar cenários 1, 2, 3, 4, 5 do
  [quickstart.md](./quickstart.md) manualmente em `npm run dev`
  (US1+US2+US3 cobertos).

- [X] T008 [P] Executar cenários 6, 7, 8, 9, 10 (validação,
  ESC, autofocus, multi-user, no-op).

- [X] T009 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Incremento 15** de `## Roadmap > 🟢 Próximos` para
    `## Releases`:
    `- **016** — Editar briefing/set após criação (Inc 15) · 2026-04-28 · specs/016-edit-set-fields/ · botão "✏️ Editar set" no header de /sets/[id]/montar abre modal com 4 campos pré-preenchidos (name/eventDate/location/briefing); reusa updateSet existente (partial update + ownership + normalizeDate + revalidatePath); pattern espelha <DeleteAccountModal>; ESC + clique fora fecham; reset on reopen via useEffect; edição de briefing alimenta IA imediatamente (revalidatePath garante); zero schema delta, zero novas Server Actions`
  - Atualizar campo `**Última atualização**`.

- [X] T010 Commit final via `/speckit-git-commit` com mensagem
  `feat(016): editar briefing e dados do set após criação`.

- [X] T011 Deploy: **sem schema delta** — pular ALTER TABLE em
  Turso. Apenas: `git checkout main && git merge --no-ff
  016-edit-set-fields && git push origin main`. Vercel
  auto-deploya (ou disparar manual via `vercel --prod --yes`).

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → T002 → T003 → T004 → T005 → T006 → (T007/T008 paralelos)
→ T009 → T010 → T011

**Critical bottleneck**: T003 (criar componente) → T004 (integrar
no page).

**Parallel windows**:
- **T007/T008**: validação manual em cenários distintos.

---

## Implementation Strategy

### MVP

T001-T004 entregam US1 + US2 (form completo funcional). T005
valida US3 sobre código já implementado.

### Sequência sugerida (~30-45min total)

1. **Setup + Foundational** (~5min): T001-T002.
2. **US1 + US2 implementation** (~25-35min): T003-T004.
3. **US3 validação** (~5min): T005.
4. **Polish + deploy** (~10-15min): T006-T011.

---

## Format Validation

- [x] Todas tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T011
- [x] `[P]` em paralelizáveis (T007/T008)
- [x] `[US1]`/`[US3]` em tasks de user story (T003-T005)
- [x] Sem labels em Setup/Foundational/Polish
- [x] Caminhos de arquivo nas tasks de código
