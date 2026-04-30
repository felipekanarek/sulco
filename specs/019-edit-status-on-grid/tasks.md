# Tasks: Editar status do disco direto na grid

**Input**: Design documents from `specs/019-edit-status-on-grid/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: Não solicitados na spec — validação via quickstart manual.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: mapeia task para user story (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: ler arquivos-chave antes de tocar código. Confirmar
existência da Server Action e shape dos componentes pais.

- [X] T001 Verify baseline: read [src/lib/actions.ts:559-595](../../src/lib/actions.ts) — confirmar shape e revalidatePath de `updateRecordStatus` (input + retorno `ActionResult`)
- [X] T002 [P] Verify baseline: read [src/components/record-card.tsx](../../src/components/record-card.tsx) — `<RecordRow>` linhas 116-125 onde `<RecordStatusActions>` será inserido na col direita
- [X] T003 [P] Verify baseline: read [src/components/record-grid-card.tsx](../../src/components/record-grid-card.tsx) — `<RecordGridCard>` linhas 76-89 onde `<RecordStatusActions>` será inserido após meta-line
- [X] T004 [P] Verify baseline: read [src/components/edit-set-modal.tsx](../../src/components/edit-set-modal.tsx) e [src/components/acknowledge-all-archived-button.tsx](../../src/components/acknowledge-all-archived-button.tsx) como referência do pattern `useTransition` + Server Action + erro inline já validado em features anteriores

**Checkpoint**: Server Action confirmada existente; locais de
inserção identificados.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: criar o componente compartilhado que ambas as user
stories vão consumir. Bloqueia US1, US2 e US3.

- [X] T005 Create [src/components/record-status-actions.tsx](../../src/components/record-status-actions.tsx) — novo client component conforme [contracts/ui-contract.md](./contracts/ui-contract.md): `'use client'`, props `{ recordId, status, recordLabel, className? }`, estado `useState<optimistic>` + `useTransition` + `useState<error>` com `useEffect` de auto-dismiss 5s. Markup com botões condicionais por status (`unrated` → Ativar+Descartar; `active` → Descartar; `discarded` → Reativar). Handler `applyStatus(target)` chama `updateRecordStatus({ recordId, status: target })`, faz rollback (`setOptimistic(null)`) em `!res.ok`, gera mensagem `'Falha ao atualizar — tente novamente.'`. Cada botão tem `aria-label="${verbo} disco ${recordLabel}"`. Classes Tailwind por contract: `font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 min-h-[44px] md:min-h-[32px] border border-line hover:border-ink ... rounded-sm disabled:opacity-50 ... transition-colors whitespace-nowrap`

**Checkpoint**: componente compartilhado pronto. US1, US2, US3
podem ser exercitadas integrando-o nos containers pai.

---

## Phase 3: User Story 1 — Aprovar disco unrated direto da grid (Priority: P1) 🎯 MVP

**Goal**: DJ na grid `/` (qualquer view) clica `Ativar` ou
`Descartar` num card `unrated` e a transição acontece com
optimistic UI + revalidação + Inbox-zero pattern (card some se
filtro corrente exclui o status novo).

**Independent Test**: cenários 1 e 2 do
[quickstart.md](./quickstart.md) — Ativar e Descartar de
`unrated`, validar SQL + comportamento Inbox-zero.

### Implementation for User Story 1

- [X] T006 [US1] Integrate `<RecordStatusActions>` em [src/components/record-card.tsx](../../src/components/record-card.tsx) (view list): importar componente; renderizar dentro do `<div className="flex flex-row items-center justify-between ...">` (linhas 116-125), abaixo do link "Curadoria →", passando `recordId={record.id}`, `status={record.status}`, `recordLabel={`${record.artist} — ${record.title}`}`, `className="mt-2 md:mt-3"`
- [X] T007 [P] [US1] Integrate `<RecordStatusActions>` em [src/components/record-grid-card.tsx](../../src/components/record-grid-card.tsx) (view grid): importar componente; renderizar após o último `<p className="label-tech text-ink-mute mt-1 ...">` dentro do `<div className="pt-3 flex flex-col gap-0.5">`, passando as mesmas props com `className="mt-2"`

**Checkpoint**: US1 funcional em ambas as views. Quickstart
cenários 1 e 2 validam.

---

## Phase 4: User Story 2 — Reverter status (Priority: P2)

**Goal**: DJ pode descartar disco já `active` ou reativar disco
`discarded` via grid, sem perder curadoria.

**Independent Test**: cenários 3 e 4 do
[quickstart.md](./quickstart.md) — Reativar de `discarded`,
Descartar de `active`. SC-006 valida preservação de curadoria.

### Implementation for User Story 2

- [X] T008 [US2] Validar comportamento condicional já implementado no T005: card `active` mostra apenas `Descartar`; card `discarded` mostra apenas `Reativar`. Sem código novo — verificação via cenários 3 e 4 do quickstart cobre.

**Checkpoint**: US2 funcional sem código adicional (já saiu do
componente compartilhado). Cenário 5 do quickstart confirma
preservação de curadoria byte-idêntica (SC-006).

---

## Phase 5: User Story 3 — Falha de servidor com rollback visual (Priority: P3)

**Goal**: erro de DB durante mudança de status reverte UI ao
estado anterior; mensagem inline aparece e some sozinha em ~5s
(ou ao disparar nova ação).

**Independent Test**: cenários 7 e 8 do
[quickstart.md](./quickstart.md) — falha simulada com rollback +
auto-dismiss + dismiss em nova ação.

### Implementation for User Story 3

- [X] T009 [US3] Validar comportamento de rollback + auto-dismiss já implementado no T005 via cenários 7 e 8. Sem código novo — pattern garante rollback em `!res.ok` e em `catch`. `useEffect` cobre auto-dismiss 5s; `setError(null)` no início de `applyStatus()` cobre dismiss em nova ação.

**Checkpoint**: US3 funcional sem código adicional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: type-check + quickstart completo + entry de release
no BACKLOG.

- [X] T010 Run TypeScript + lint: `npm run build`. Confirmar zero erros relacionados a `<RecordStatusActions>` ou imports em `<RecordRow>` / `<RecordGridCard>`.
- [ ] T011 [P] Execute quickstart cenários 1, 2 (US1) em desktop view list (`/?view=list`).
- [ ] T012 [P] Execute quickstart cenários 3, 4 (US2) em desktop.
- [ ] T013 [P] Execute quickstart cenário 5 (preservação de curadoria — SC-006): SQL antes/depois confirma byte-equality.
- [ ] T014 [P] Execute quickstart cenário 6 (race click + disabled durante isPending — FR-009) com Network throttling Slow 3G.
- [ ] T015 [P] Execute quickstart cenários 7, 8 (US3 + auto-dismiss + dismiss-on-new-action).
- [ ] T016 [P] Execute quickstart cenário 9 (mobile / Princípio V — view list, viewport 375×667 + 390×844): tap target ≥44×44 mensurado via DevTools.
- [ ] T017 [P] Execute quickstart cenário 10 (mobile / view grid, viewport 375×667): card grid acomoda botões sem regressão visual.
- [ ] T018 [P] Execute quickstart cenário 11 (acessibilidade — FR-012): `aria-label` por botão, foco via Tab, Enter dispara, leitor de tela anuncia ação.
- [ ] T019 [P] Execute quickstart cenário 12 (multi-user isolation — FR-008 / SC-005): 2 contas, mudanças de DJ A não afetam DJ B.
- [ ] T020 [P] Execute quickstart cenário 13 (discos archived ficam fora): card archived NÃO renderiza `<RecordStatusActions>`.
- [ ] T021 Validação de densidade da grid (SC-004): contar cards visíveis em desktop 1280×800 antes vs depois do feature; diferença ≤20%.
- [X] T022 Add release entry to [BACKLOG.md](../../BACKLOG.md): mover Inc 19 de "🟢 Próximos" para "Releases" como `019-edit-status-on-grid` com one-line summary; atualizar header "Última atualização".

**Checkpoint**: feature pronta para commit/merge/deploy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 sequencial; T002–T004 paralelos (read-only).
- **Foundational (Phase 2)**: T005 sequencial — bloqueia tudo que vem depois.
- **US1 (Phase 3)**: T006 sequencial; T007 pode rodar em paralelo (arquivo diferente).
- **US2 (Phase 4)**: T008 verificação manual — sem código.
- **US3 (Phase 5)**: T009 verificação manual — sem código.
- **Polish (Phase 6)**: T010 sequencial após implementação completa; T011–T020 paralelos (cenários manuais distintos); T021 sequencial; T022 final.

### User Story Dependencies

- **US1 (P1)**: depende de T005 (componente). Entrega valor: triagem rápida funciona.
- **US2 (P2)**: depende de T005 e T006/T007 (integração). Sem código novo.
- **US3 (P3)**: depende de T005 (componente já contém o pattern de rollback). Sem código novo.

### Within Each User Story

- US1: T005 (componente) → T006 (view list) || T007 (view grid).
- US2: nenhuma task de código (cobertura via componente já feito).
- US3: nenhuma task de código (cobertura via componente já feito).

### Parallel Opportunities

- T002, T003, T004 paralelos no Setup.
- T006 e T007 paralelos em US1 (arquivos diferentes; ambos importam o T005 já criado).
- T011 a T020 paralelos no Polish (cenários manuais não-conflitantes).

---

## Parallel Example: Setup phase

```bash
# Read all baseline files in parallel:
Task: "Read src/lib/actions.ts:559-595 (updateRecordStatus)"
Task: "Read src/components/record-card.tsx (<RecordRow>)"
Task: "Read src/components/record-grid-card.tsx (<RecordGridCard>)"
Task: "Read src/components/edit-set-modal.tsx (pattern reference)"
```

## Parallel Example: User Story 1

```bash
# Once T005 is complete, integrate in both views simultaneously:
Task: "Integrate <RecordStatusActions> in src/components/record-card.tsx (view list)"
Task: "Integrate <RecordStatusActions> in src/components/record-grid-card.tsx (view grid)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1+2 (Setup + Foundational): T001 → T002/T003/T004 paralelos → T005.
2. Phase 3 (US1): T006/T007 paralelos.
3. **STOP**: validar cenários 1, 2 do quickstart.
4. Já entrega valor real: triagem rápida `unrated → active/discarded`
   funciona em ambas as views.

### Incremental Delivery

1. MVP (US1) → testar cenários 1, 2 → commit.
2. US2 + US3 (sem código novo) → testar cenários 3, 4, 7, 8 → commit (se mudanças surgirem do quickstart).
3. Polish (T010–T022) → quickstart completo → commit final → deploy.

### Solo Strategy (single dev — Felipe)

Sequência linear esperada:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → (validar cenários 1, 2) →
(validar cenários 3, 4) → (validar cenários 7, 8) → T010 → T011…T020 →
T021 → T022.

---

## Notes

- Tests **não solicitados**. Validação via quickstart manual.
- Princípio I respeitado: feature edita campo AUTHOR `status` via
  ato explícito do DJ. Sem fonte externa.
- Princípio IV respeitado: status é reversível, sem delete.
  Sem confirmação por design (Clarification justificada).
- Princípio V (Mobile-Native): tap target ≥44 mobile via Tailwind
  responsive (`min-h-[44px] md:min-h-[32px]`).
- Sem schema delta; sem `data-model.md`; sem novas Server Actions.
- Server Action `updateRecordStatus` reusada **sem mudança** (já
  faz Zod, ownership, revalidatePath nas 3 rotas).
- Componente compartilhado entre view list e view grid via prop
  `className` — sem duplicação.
- Inbox-zero pattern (Q1) é comportamento natural do
  revalidatePath existente; sem código novo pra implementar.
- Auto-dismiss do erro (Q2) cobre Princípio V e UX cross-device.
- Discos `archived=true` ficam fora — fluxo separado em `/status`
  (Inc 11/017).
- Commit recomendado: 1 commit no fim da Phase 3 (US1 entregue) e
  1 commit no fim do Polish (com BACKLOG entry e validações
  manuais documentadas).
