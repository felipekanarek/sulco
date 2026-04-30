# Tasks: Prateleira como select picker (com auto-add)

**Input**: Design documents from `specs/020-shelf-picker-autoadd/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: Não solicitados na spec — validação via quickstart manual.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: mapeia task para user story (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar arquivos-chave e primitivas que vão ser
reusadas. Sem código novo nesta fase.

- [X] T001 Verify baseline: read [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) — confirmar imports atuais (`db`, `records`, `eq`, `and`, `sql`, possivelmente `isNotNull`) e local apropriado pra adicionar `listUserShelves`
- [X] T002 [P] Verify baseline: read [src/components/record-controls.tsx](../../src/components/record-controls.tsx) linhas 87-101 — bloco do `<input type="text">` de prateleira que será substituído pelo `<ShelfPicker>`
- [X] T003 [P] Verify baseline: read [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx) — entender como `record` é carregado pra adicionar `listUserShelves(user.id)` em paralelo via `Promise.all`
- [X] T004 [P] Verify baseline: read [src/components/mobile-drawer.tsx](../../src/components/mobile-drawer.tsx) — confirmar API do `<MobileDrawer side="bottom">` (props `open`, `onClose`, `ariaLabel`, `children`) que será reusado em mobile
- [X] T005 [P] Verify baseline: read [src/lib/actions.ts:737-770](../../src/lib/actions.ts) — confirmar `updateRecordAuthorFields` aceita `shelfLocation: string | null | undefined` (sem mudança necessária)

**Checkpoint**: locais de inserção e primitivas reusadas
identificados; pronto pra criar query helper + componente.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: criar o helper server-side que ambas as user stories
vão consumir via prop. Bloqueia US1 e US2.

- [X] T006 Add `listUserShelves(userId: number): Promise<string[]>` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) conforme [contracts/ui-contract.md](./contracts/ui-contract.md): `db.selectDistinct({ shelf: records.shelfLocation }).from(records).where(and(eq(records.userId, userId), isNotNull(records.shelfLocation))).orderBy(sql\`lower(${records.shelfLocation})\`)`. Filtrar resultado em JS pra remover null/whitespace-only e tipar como `string[]`. Adicionar `isNotNull` no import do `drizzle-orm` se ainda não existir.

**Checkpoint**: helper pronto. US1 (reusar) e US2 (criar) podem
consumir a lista.

---

## Phase 3: User Story 1 — Reusar prateleira existente (Priority: P1) 🎯 MVP

**Goal**: DJ abre o picker em `/disco/[id]`, vê lista alfabética
de prateleiras já em uso, filtra por digitação case-insensitive,
clica e o disco é movido.

**Independent Test**: cenário 1 do
[quickstart.md](./quickstart.md) — abrir picker, filtrar com 1-2
chars, clicar prateleira, validar SQL.

### Implementation for User Story 1

- [X] T007 [US1] Create [src/components/shelf-picker.tsx](../../src/components/shelf-picker.tsx) — novo client component conforme [contracts/ui-contract.md](./contracts/ui-contract.md): `'use client'`, props `{ recordId, current, userShelves, className? }`, estado `useState<open>` + `useState<query>` + `useState<optimistic>` + `useTransition` + `useState<error>` + `useState<activeIdx>`. Computed list (filtered por substring case-insensitive, exactMatch case-sensitive, showAddItem, isEmpty). Handler `selectShelf(value: string | null)` chama `updateRecordAuthorFields({ recordId, shelfLocation: value })` com optimistic update + rollback. `handleKeyDown` cobre ↑/↓/Enter/Escape. `useEffect` reset optimistic ao mudar `current`. `useEffect` auto-dismiss erro 5s. Markup: trigger button + popover (md:block) + MobileDrawer (md:hidden). ARIA: `aria-haspopup="listbox"`, `aria-expanded`, `role="combobox"` no input, `role="listbox"` na ul, `role="option"` nos itens, `aria-activedescendant` quando `activeIdx >= 0`. Lista: "— Sem prateleira —" sempre primeiro + filtered + "+ Adicionar 'X'" quando aplicável. Empty state com texto auxiliar.
- [X] T008 [US1] Wire prop `userShelves` em [src/components/record-controls.tsx](../../src/components/record-controls.tsx): adicionar `userShelves: string[]` ao tipo de props (linhas 8-18); substituir o bloco `<input type="text">` (linhas 87-101) por `<ShelfPicker recordId={recordId} current={shelfLocation} userShelves={userShelves} />`. Remover `localShelf` state + `commitShelf` (não mais necessários — picker tem o próprio fluxo). Manter o `<label>` "Prateleira".
- [X] T009 [US1] Carregar e passar `userShelves` em [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx): importar `listUserShelves` de `@/lib/queries/collection`; adicionar `listUserShelves(user.id)` ao `Promise.all` existente (linhas 40-44) ou criar novo bloco; passar `userShelves` como prop pra `<RecordControls>`.

**Checkpoint**: US1 funcional. Quickstart cenário 1 valida.

---

## Phase 4: User Story 2 — Criar nova prateleira on-the-fly (Priority: P1)

**Goal**: DJ digita termo que não existe; opção "+ Adicionar 'X'"
aparece como última da lista; clicar persiste e a próxima abertura
do picker (qualquer disco do mesmo DJ) já lista X.

**Independent Test**: cenário 2 do
[quickstart.md](./quickstart.md) — digitar termo novo, clicar
"+ Adicionar", abrir outro disco, ver na lista.

### Implementation for User Story 2

- [X] T010 [US2] Validar comportamento já implementado no T007: `showAddItem = trimmedQuery.length > 0 && !exactMatch`; clicar item dispara `selectShelf(trimmedQuery)`. Sem código novo — verificação via cenário 2 do quickstart cobre.

**Checkpoint**: US2 funcional sem código adicional. Cenário 2
+ verificação cross-disco (item aparece na lista do disco B
após criar no disco A) validam.

---

## Phase 5: User Story 3 — Limpar prateleira (Priority: P2)

**Goal**: DJ clica "— Sem prateleira —" no topo da lista; disco
fica com `shelfLocation = NULL` no DB.

**Independent Test**: cenário 3 do
[quickstart.md](./quickstart.md) — clicar item de limpar, validar
SQL.

### Implementation for User Story 3

- [X] T011 [US3] Validar comportamento já implementado no T007: lista renderiza "— Sem prateleira —" como primeiro item sempre; clicar dispara `selectShelf(null)`. Sem código novo — verificação via cenário 3 cobre.

**Checkpoint**: US3 funcional sem código adicional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: type-check + quickstart completo + entry de release
no BACKLOG.

- [X] T012 Run TypeScript + lint: `npm run build`. Confirmar zero erros relacionados a `<ShelfPicker>`, `listUserShelves`, ou imports atualizados em `<RecordControls>` e `/disco/[id]/page.tsx`.
- [ ] T013 [P] Execute quickstart cenários 1, 2, 3 (US1 + US2 + US3) em desktop: reusar / criar / limpar funcionam end-to-end com SQL validado.
- [ ] T014 [P] Execute quickstart cenários 4, 5 (match exato suprime "+ Adicionar"; casing diferente cria nova entrada — comportamento "preserve casing" da Decisão 1).
- [ ] T015 [P] Execute quickstart cenários 6, 7 (trim de whitespace; limite 50 chars).
- [ ] T016 [P] Execute quickstart cenário 8 (lista vazia + texto auxiliar acolhedor).
- [ ] T017 [P] Execute quickstart cenário 9 (mobile / Princípio V — viewport 375×667 + 390×844): bottom sheet via `<MobileDrawer>` abre com slide-up, tap target itens ≥44 px medido via DevTools, sem scroll horizontal, ESC e clique no backdrop fecham.
- [ ] T018 [P] Execute quickstart cenário 10 (acessibilidade / FR-013): `aria-haspopup`, `aria-expanded`, `role="combobox"`, `aria-activedescendant`, navegação ↑/↓/Enter/Escape funciona; VoiceOver/NVDA anuncia corretamente.
- [ ] T019 [P] Execute quickstart cenário 11 (multi-user isolation / FR-011 / SC-006): 2 contas, prateleiras de A não aparecem em B.
- [ ] T020 [P] Execute quickstart cenário 12 (lista grande ~50 prateleiras): scroll vertical funciona, filtragem reduz instantaneamente.
- [ ] T021 [P] Execute quickstart cenário 13 (race / sync entre discos / SC-004): criar prateleira nova em /disco/A → aparece em /disco/B em ≤1s.
- [ ] T022 [P] Execute quickstart cenário 14 (erro de servidor + rollback otimistic + auto-dismiss 5s).
- [X] T023 Add release entry to [BACKLOG.md](../../BACKLOG.md): mover Inc 21 de "🟢 Próximos" para "Releases" como `020-shelf-picker-autoadd` com one-line summary; atualizar header "Última atualização".

**Checkpoint**: feature pronta para commit/merge/deploy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 sequencial; T002–T005 paralelos (read-only).
- **Foundational (Phase 2)**: T006 sequencial — bloqueia tudo.
- **US1 (Phase 3)**: T007 sequencial primeiro (componente); T008 depende de T007 (consome o componente); T009 depende de T006 (consome o helper).
  - T008 e T009 podem rodar em paralelo após T007 (arquivos distintos).
- **US2 (Phase 4)**: T010 verificação manual — sem código novo.
- **US3 (Phase 5)**: T011 verificação manual — sem código novo.
- **Polish (Phase 6)**: T012 sequencial após implementação completa; T013–T022 paralelos (cenários manuais distintos); T023 final.

### User Story Dependencies

- **US1 (P1)**: depende de T006 (helper) + T007 (componente). Entrega valor: reuso de prateleiras existentes funciona.
- **US2 (P1)**: depende de T007. Sem código novo — comportamento "+ Adicionar" já saiu do componente.
- **US3 (P2)**: depende de T007. Sem código novo — comportamento "— Sem prateleira —" já saiu do componente.

### Within Each User Story

- US1: T007 (componente) → T008 (consumir em RecordControls) || T009 (carregar lista no RSC).
- US2 / US3: nenhuma task de código (cobertura via componente já feito em T007).

### Parallel Opportunities

- T002, T003, T004, T005 paralelos no Setup.
- T008 e T009 paralelos em US1 (depois de T007).
- T013 a T022 paralelos no Polish (cenários manuais não-conflitantes).

---

## Parallel Example: Setup phase

```bash
# Read all baseline files in parallel:
Task: "Read src/lib/queries/collection.ts (imports + estrutura)"
Task: "Read src/components/record-controls.tsx linhas 87-101"
Task: "Read src/app/disco/[id]/page.tsx (Promise.all + carregamento)"
Task: "Read src/components/mobile-drawer.tsx (API)"
Task: "Read src/lib/actions.ts:737-770 (updateRecordAuthorFields)"
```

## Parallel Example: User Story 1

```bash
# Once T006 + T007 done, integrate consumers in parallel:
Task: "Wire userShelves prop em src/components/record-controls.tsx"
Task: "Carregar listUserShelves em src/app/disco/[id]/page.tsx"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1+2 (Setup + Foundational): T001 → T002–T005 paralelos → T006.
2. Phase 3 (US1): T007 → T008/T009 paralelos.
3. **STOP**: validar cenário 1 do quickstart.
4. Já entrega valor real — DJ pode reusar prateleiras existentes
   sem digitar.

### Incremental Delivery

1. MVP (US1) → testar cenário 1 → commit.
2. US2 + US3 (sem código novo) → testar cenários 2, 3 → commit
   (se ajustes surgirem do quickstart).
3. Polish (T012–T023) → quickstart completo → commit final → deploy.

### Solo Strategy (single dev — Felipe)

Sequência linear esperada:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 →
(validar cenário 1) → (validar cenário 2) → (validar cenário 3) →
T012 → T013…T022 → T023.

---

## Notes

- Tests **não solicitados**. Validação via quickstart manual.
- Princípio I respeitado: feature edita campo AUTHOR
  `shelfLocation` via clique do DJ (sem normalização forçada,
  Decisão 1 do research). Sem fonte externa.
- Princípio II respeitado: lista carregada server-side no RSC e
  passada por prop; client component mínimo.
- Princípio IV respeitado: nenhum delete; mudança reversível;
  setar NULL preserva o disco.
- Princípio V (Mobile-Native): `<MobileDrawer side="bottom">`
  reusado (Inc 009 baseline). Tap targets ≥44 mobile via
  Tailwind responsive (`min-h-[44px] md:min-h-[36px]`).
- Sem schema delta; sem `data-model.md`; sem novas Server Actions
  de escrita.
- Server Action `updateRecordAuthorFields` reusada **sem mudança**
  (Zod, ownership, revalidatePath nas 3 rotas).
- Helper `listUserShelves` é leitura distinct — barata, índice
  por user_id já cobre.
- Casing preservado (Decisão 1): `trim()` apenas. Filtragem
  case-insensitive na busca; match exato case-sensitive pra
  suprimir "+ Adicionar".
- Commit recomendado: 1 commit no fim da Phase 3 (US1+US2+US3
  funcionam — componente cobre as 3) e 1 commit no fim do Polish.
