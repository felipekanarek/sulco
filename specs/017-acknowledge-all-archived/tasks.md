# Tasks: Botão "Reconhecer tudo" no banner de archived

**Input**: Design documents from `specs/017-acknowledge-all-archived/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: Não solicitados na spec — validação via quickstart manual.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: mapeia task para user story (US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar baseline antes de adicionar código novo. Sem
schema delta — nada de migration aqui.

- [X] T001 Verify baseline state: read [src/app/status/page.tsx](../../src/app/status/page.tsx) and confirm `archivedPending` shape (array of records) is available as already-rendered prop in the "Discos arquivados" section header
- [X] T002 [P] Verify baseline state: read [src/lib/actions.ts](../../src/lib/actions.ts) and locate existing `acknowledgeArchivedRecord` (around line 1528) — confirm shape and naming conventions to mirror in new bulk action
- [X] T003 [P] Verify baseline state: read [src/components/edit-set-modal.tsx](../../src/components/edit-set-modal.tsx) for `useTransition` + Server Action client pattern reference (no edit; this is the prior-art template)

**Checkpoint**: code shape understood; ready to add new files / edits.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: nenhuma. Reusa coluna `records.archivedAcknowledgedAt`
(já existente) e helper `requireCurrentUser` (já existente). Sem tarefas
nesta fase.

- (none — no schema delta, no shared infra changes)

**Checkpoint**: foundation pronta por padrão (nada a fazer).

---

## Phase 3: User Story 1 — Reconhecer múltiplos archived de uma vez (Priority: P1) 🎯 MVP

**Goal**: DJ com 2+ archived pendentes faz reconhecimento bulk com 1
clique no botão "Reconhecer tudo" + 1 confirmação. Records ficam com
`archivedAcknowledgedAt = now()`; seção e banner global somem.

**Independent Test**: cenário 1 do
[quickstart.md](./quickstart.md#cenário-1--caso-fundador-2-archived-pendentes).
Estado pré: ≥2 archived pendentes. Pós-clique + confirm: SQL confirma
`COUNT(*) = 0` para `archived = 1 AND archived_acknowledged_at IS NULL`
do user; banner global ausente em `/`.

### Implementation for User Story 1

- [X] T004 [US1] Implement Server Action `acknowledgeAllArchived()` in [src/lib/actions.ts](../../src/lib/actions.ts) following contract in [contracts/server-actions.md](./contracts/server-actions.md): `'use server'`, no input, derive `userId` via `requireCurrentUser()`, bulk `db.update(records).set({ archivedAcknowledgedAt: new Date() }).where(and(eq(records.userId, userId), eq(records.archived, 1), isNull(records.archivedAcknowledgedAt)))`, capture rowsAffected as `count`, call `revalidatePath('/status')` + `revalidatePath('/')`, return `{ ok: true, count }` or `{ ok: false, error: 'Falha ao reconhecer — tente novamente.' }` from try/catch
- [X] T005 [P] [US1] Create client component `<AcknowledgeAllArchivedButton>` in [src/components/acknowledge-all-archived-button.tsx](../../src/components/acknowledge-all-archived-button.tsx): `'use client'`, props `{ count: number }`, `useTransition` + `useRouter`, on click → `window.confirm("Marcar todos os ${count} como reconhecidos?")` → if confirmed call `acknowledgeAllArchived()` inside `startTransition`, on `!res.ok` set inline error state, on success call `router.refresh()`. Tailwind: `min-h-[44px]` tap target (Princípio V), label "Reconhecer tudo" (or "Reconhecendo…" while `isPending`), `disabled={isPending}`. Render error inline below button when present.
- [X] T006 [US1] Wire `<AcknowledgeAllArchivedButton count={archivedPending.length} />` into header of "Discos arquivados" section in [src/app/status/page.tsx](../../src/app/status/page.tsx), positioned next to existing `"N pendentes"` counter via flex layout (with flex-wrap to preserve mobile tap target). Conditional render: `archivedPending.length > 0` for now (US2 will tighten the threshold).

**Checkpoint**: User Story 1 fully functional. Run quickstart cenário 1
to validate before proceeding.

---

## Phase 4: User Story 2 — Botão só aparece com ≥2 pendentes (Priority: P2)

**Goal**: clean UX. Com exatamente 1 archived pendente, botão
"Reconhecer tudo" não renderiza (botão individual basta).

**Independent Test**: cenário 3 do
[quickstart.md](./quickstart.md#cenário-3--threshold-user-story-2--fr-002).
Estado A (1 pendente): seção renderiza, header SEM botão. Estado B
(0 pendentes): seção inteira não renderiza.

### Implementation for User Story 2

- [X] T007 [US2] Tighten conditional render in [src/app/status/page.tsx](../../src/app/status/page.tsx) from `archivedPending.length > 0` to `archivedPending.length >= 2` for the `<AcknowledgeAllArchivedButton>`. The seção "Discos arquivados" itself continues to render whenever `archivedPending.length > 0` (botão individual permanece para 1 disco).

**Checkpoint**: ambas user stories funcionais. Cenário 3 valida threshold.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: validação, type-check e quickstart completo. Mobile
(Princípio V), multi-user isolation, e race click cobertos aqui.

- [X] T008 Run TypeScript + lint: `npm run build` (build serve como type-check ao mesmo tempo). Confirmar zero erros relacionados a `acknowledgeAllArchived` ou `<AcknowledgeAllArchivedButton>`.
- [ ] T009 [P] Execute quickstart cenários 2 (cancel), 4 (multi-user isolation), 6 (race click), 7 (DB error) from [quickstart.md](./quickstart.md). Document results inline in quickstart or PR description.
- [ ] T010 [P] Execute quickstart cenário 5 (mobile / Princípio V) from [quickstart.md](./quickstart.md): viewport 375×667 + 390×844, verify tap target ≥44×44 px via DevTools, no scroll horizontal, `window.confirm` overlay nativo. Document tap-target measurement.
- [ ] T011 Verify cross-route banner sync: after a successful bulk acknowledge in `/status`, navigate to `/`, `/sets`, and `/disco/[id]` — confirm `<ArchivedRecordsBanner>` (global) is gone everywhere (validates `revalidatePath('/')` propagation).
- [X] T012 Add release entry to [BACKLOG.md](../../BACKLOG.md) under "Releases" section: `017-acknowledge-all-archived (Inc 11)` linking to [specs/017-acknowledge-all-archived/](.) with one-line summary.

**Checkpoint**: feature pronta para commit/merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 / T002 / T003 são read-only e independentes (T002 e T003 marcados [P]).
- **Foundational (Phase 2)**: vazia. Não bloqueia nada.
- **US1 (Phase 3)**: pode começar imediatamente após Setup.
- **US2 (Phase 4)**: depende de T006 (US1 integration) — modifica a mesma condição de render. **Estritamente sequencial** após US1.
- **Polish (Phase 5)**: depende de US1 + US2 completas. T008 sequencial; T009/T010 podem rodar em paralelo (cenários manuais distintos); T011 depende de T009 estar OK; T012 sequencial.

### User Story Dependencies

- **US1 (P1)**: independente. Entrega valor sozinha — botão visível em qualquer `archivedPending.length > 0` (regressão UX leve com 1 pendente, mas funcional).
- **US2 (P2)**: depende de US1. Strictly polish on top of US1.

### Within Each User Story

- US1: T004 (action) + T005 (component) podem ser feitos em paralelo (arquivos diferentes); T006 (page wiring) DEPENDE de T004 e T005.
- US2: 1 task única (T007).

### Parallel Opportunities

- T002, T003 paralelos no Setup.
- T004, T005 paralelos dentro de US1.
- T009, T010 paralelos no Polish (cenários manuais não-conflitantes).

---

## Parallel Example: User Story 1

```bash
# Launch action + component in parallel (different files, no shared deps):
Task: "Implement Server Action acknowledgeAllArchived() in src/lib/actions.ts"
Task: "Create <AcknowledgeAllArchivedButton> in src/components/acknowledge-all-archived-button.tsx"

# Then sequentially wire into page:
Task: "Wire <AcknowledgeAllArchivedButton> into src/app/status/page.tsx header"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Setup: T001 → T002/T003 paralelo.
2. (Foundational vazio.)
3. US1: T004/T005 paralelo → T006.
4. **STOP**: validar cenário 1 do quickstart manualmente.
5. Já entrega valor real: DJ com 2+ archived pode reconhecer bulk.

### Incremental Delivery

1. MVP (US1) → testar cenário 1 → commit.
2. US2 (T007) → testar cenário 3 → commit.
3. Polish (T008–T012) → quickstart completo → commit final → release.

### Solo Strategy (single dev — Felipe)

Sequência linear esperada:
T001 → T002 → T003 → T004 → T005 → T006 (validar cenário 1) → T007
(validar cenário 3) → T008 → T009 → T010 → T011 → T012.

---

## Notes

- Tests **não solicitados**. Validação via quickstart manual.
- Princípio V (Mobile-Native) cumprido pelo design: `min-h-[44px]` no
  botão (T005), `window.confirm` nativo, layout flex-wrap (T006).
- Princípio I respeitado: `archivedAcknowledgedAt` é zona SYS, não
  AUTHOR. `acknowledgeArchivedRecord` existente intacto — botão
  individual continua funcionando.
- Atomicidade garantida pelo SQLite/Turso (single-statement DML em
  transação implícita). Sem `db.transaction` manual.
- Multi-user isolation via `WHERE userId = ?` na action (T004).
- Sem schema delta; sem `data-model.md`.
- Commit após cada checkpoint (US1 done; US2 done; Polish done).
