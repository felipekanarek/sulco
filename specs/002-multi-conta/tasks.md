---
description: "Tasks for 002-multi-conta (pivot 2026-04-23: allowlist interna)"
---

# Tasks: Multi-conta com allowlist interna

**Input**: Design documents em `specs/002-multi-conta/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md

**Tests**: Incluídos apenas testes de isolamento e invariantes críticas
(R8 do research). Sem TDD estrito — código primeiro, teste em seguida
onde valor é alto.

**Organization**: Tasks agrupadas por user story para entrega
incremental e testável.

> **Pivot 2026-04-23**: Clerk Allowlist é Pro. Implementamos allowlist
> própria via tabela `invites` + coluna `users.allowlisted` + middleware.
> Algumas tasks do plan original foram substituídas ou expandidas;
> marcadas com 🔄 abaixo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: roda em paralelo (arquivo diferente, sem dependência)
- **[Story]**: US1..US4 (mapeia para user stories da spec.md)
- Caminhos absolutos ao working dir do repo

## Path Conventions

Monolítico Next.js App Router: `src/` e `tests/` na raiz do repo.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: documentação antecipada + env var.

- [X] T001 Criar `docs/convites.md` com passo-a-passo de uso do
  `/admin/convites` + fallback Turso shell 🔄 revisado pós-pivot
- [X] T002 Adicionar `OWNER_EMAIL=` em `.env.example`
- [X] T003 [P] Documentar `OWNER_EMAIL` em `docs/deploy.md`
- [X] T004 Adicionar `OWNER_EMAIL` na Vercel (Prod + Preview) via CLI

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: mudanças de schema + helpers de autorização — blocam US1,
US3, US4.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta phase terminar.

- [X] T005 Atualizar `src/db/schema.ts`:
  - adicionar `isOwner` boolean em `users` (NOT NULL default false)
  - adicionar `allowlisted` boolean em `users` (NOT NULL default false)
  - adicionar `userId` em `playlists` e `playlistTracks` (FK → users, CASCADE)
  - criar nova tabela `invites` com `id`, `email` (UNIQUE LOWER), `createdAt`,
    `addedByUserId` (FK → users SET NULL)
- [X] T006 Rodar `DATABASE_URL=... DATABASE_AUTH_TOKEN=... npm run
  db:push` contra Turso prod e validar com
  `PRAGMA table_info('users'); PRAGMA table_info('invites'); PRAGMA
  table_info('playlists'); PRAGMA table_info('playlist_tracks');`
- [X] T007 Criar helpers em `src/lib/auth.ts`:
  - `requireOwner()` — `requireCurrentUser` + SELECT `is_owner`; se !owner → `notFound()`
  - `isCurrentUserOwner(): Promise<boolean>` — variante sem throw
  - `OWNER_EMAIL` exportado de `process.env` (throw se ausente em prod)

---

## Phase 3: User Story 1 — Allowlist funcional + promoção de owner (Priority: P1) 🎯 MVP

**Goal**: após T007, o webhook Clerk promove corretamente owner e marca
`allowlisted` consultando `invites`; middleware filtra não-allowlisted.

**Independent Test**: (1) owner faz primeiro signup com email ==
`OWNER_EMAIL` verified → `is_owner=true` + `allowlisted=true`. (2)
amigo com email em `invites` faz signup → `allowlisted=true`.
(3) estranho sem invite faz signup → `allowlisted=false` + redirect
para `/convite-fechado` na próxima request.

### Implementation

- [X] T008 [US1] Atualizar `src/app/api/webhooks/clerk/route.ts`
  `user.created`: inserir user com flags `isOwner` e `allowlisted`
  calculadas conforme `contracts/invites.md` §5
- [X] T009 [US1] Atualizar `src/app/api/webhooks/clerk/route.ts`
  `user.updated`: re-avaliar `allowlisted` se email mudou; promover
  owner se finalmente verificou
- [X] T010 [US1] Atualizar `src/middleware.ts` para fazer SELECT
  `users.allowlisted` em toda request autenticada não-pública;
  redirect para `/convite-fechado` se `false` (conforme
  `contracts/invites.md` §4)
- [X] T011 [US1] Adicionar `/convite-fechado` e `/admin`, `/admin/convites`
  ao tratamento do middleware (pública / protegida+owner respectivamente)
- [ ] T012 [US1] Escrever teste `tests/integration/allowlist-flow.test.ts`:
  - user criado com email em invites → allowlisted=true
  - user criado sem invite → allowlisted=false
  - addInvite promove user existente retroativamente
  - removeInvite desaloca user (exceto owner)
- [ ] T013 [US1] Escrever teste `tests/integration/owner-promotion.test.ts`:
  - email=OWNER_EMAIL verified → is_owner=true E allowlisted=true
  - segundo user com mesmo email (simulado) não promove
  - email=OWNER_EMAIL não-verified não promove
- [ ] T014 [US1] Escrever teste `tests/integration/multi-user-isolation.test.ts`:
  dois users com records/sets próprios; nenhuma query retorna dados
  cruzados mesmo forçando IDs

**Checkpoint**: convite/desconvite funciona no nível de dados; owner
é promovido corretamente; isolamento validado.

---

## Phase 4: User Story 2 — `/convite-fechado` + `/admin/convites` (Priority: P1)

**Goal**: owner gerencia allowlist via UI no Sulco; não-allowlisted
veem página em pt-BR explicando o modelo.

**Independent Test**: (1) owner adiciona email via `/admin/convites`
→ user criado depois é allowlisted. (2) estranho acessa / → redirect
para `/convite-fechado` com copy em pt-BR.

### Implementation

- [X] T015 [US2] Criar `src/app/convite-fechado/page.tsx` (Server
  Component público) com copy em pt-BR e botão `mailto:${OWNER_EMAIL}`
- [X] T016 [US2] Criar Server Actions `addInvite` e `removeInvite` em
  `src/lib/actions.ts` conforme `contracts/invites.md` §2
- [X] T017 [US2] Criar `src/app/admin/convites/page.tsx` (Server
  Component) com form de adicionar + lista de invites existentes com
  botão remover; `requireOwner()` no topo
- [ ] T018 [US2] Escrever teste e2e `tests/e2e/convite-fechado.spec.ts`:
  criar user sem invite, fazer login, validar redirect automático
  para `/convite-fechado` e conteúdo da página

**Checkpoint**: fluxo completo de convite operável sem sair do Sulco.

---

## Phase 5: User Story 3 — Painel `/admin` (Priority: P2)

**Goal**: owner consulta estado de todas as contas em uma tela.

**Independent Test**: logado como owner → `/admin` mostra tabela;
logado como não-owner → 404.

### Implementation

- [X] T019 [US3] Criar `src/lib/queries/admin.ts` com função
  `listAllUsers(): Promise<AdminRow[]>` executando a query agregada
  de `contracts/admin-page.md` §Query (acrescentar coluna `allowlisted`)
- [X] T020 [US3] [P] Criar `src/components/admin-row.tsx` (Server
  Component) com badge de status conforme `contracts/admin-page.md`
- [X] T021 [US3] Criar `src/app/admin/page.tsx`: `requireOwner()` +
  `listAllUsers()` + tabela; `export const dynamic = 'force-dynamic'`
- [X] T022 [US3] Adicionar link "Convites" no painel `/admin` apontando
  para `/admin/convites`
- [ ] T023 [US3] Escrever teste `tests/integration/admin-access.test.ts`:
  - owner → /admin retorna 200
  - convidado allowlisted → /admin retorna 404
  - /admin/convites tem mesmo comportamento

**Checkpoint**: owner tem visão agregada + link rápido pra gestão de convites.

---

## Phase 6: User Story 4 — Playlists com `user_id` (dívida audit) (Priority: P2)

**Goal**: fechar dívida do audit mesmo sem UI ativa de playlists.

**Independent Test**: constraints via Turso shell funcionam; cascade OK.

### Implementation

- [ ] T024 [US4] Verificação prévia: `turso db shell sulco-prod
  "SELECT COUNT(*) FROM playlists; SELECT COUNT(*) FROM playlist_tracks;"`
  — confirmar 0 linhas antes da migração (já planejado em T006 schema)
- [ ] T025 [US4] Escrever teste `tests/integration/playlists-scoping.test.ts`:
  - INSERT sem `user_id` falha (NOT NULL)
  - INSERT com `user_id` válido sucede
  - DELETE de user em cascata remove playlists + playlist_tracks
  - query `WHERE user_id = A` nunca retorna linhas do user B

**Checkpoint**: constraints vigentes + cascade operacional.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T026 [P] Atualizar `README.md` com seção "Convidados" linkando
  `docs/convites.md`
- [ ] T027 [P] Atualizar `docs/quickstart-walkthrough.md` com passo
  de convite (após onboarding do owner)
- [ ] T028 [P] Atualizar `CLAUDE.md` seção "Histórico de decisões"
  com linha sobre allowlist interna vs. Clerk Pro
- [ ] T029 Rodar `specs/002-multi-conta/quickstart.md` ponta-a-ponta
  com owner + 1 convidado real
- [ ] T030 Executar `npx tsc --noEmit`, `npm test`,
  `npm run test:constitution` e confirmar zero regressões
- [ ] T031 Deploy: `vercel deploy --prod --yes`; validar smoke
  (/admin renderiza só pro owner; /convite-fechado acessível)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: zero — pode começar imediatamente
- **Foundational (P2)**: depende de T001-T004 (docs + env var)
- **US1 (P3)**: depende de Foundational (schema + helpers)
- **US2 (P4)**: depende de Foundational (schema) e recomendado após US1
  (middleware funcional garante filtragem); páginas podem ser feitas em
  paralelo
- **US3 (P5)**: depende de Foundational e US1 (precisa ter user owner)
- **US4 (P6)**: independente — schema já foi migrado em T005+T006, só
  restam tests
- **Polish (P7)**: depende de todas anteriores

### Parallel Opportunities

- T003, T004 paralelos dentro de Setup (desde que OWNER_EMAIL definido)
- T008/T009 (webhook updates) são sequenciais (mesmo arquivo)
- T010/T011 (middleware) também sequencial (mesmo arquivo)
- T012/T013/T014 (testes US1) podem rodar em paralelo (arquivos
  diferentes, setup igual)
- T015/T016/T017 em US2: T016 pode paralelizar com T015; T017 depende
  de T016
- US4 T025 independente de outros testes

---

## Implementation Strategy

### MVP (US1 + US2 — ambos P1)

1. Phase 1: Setup
2. Phase 2: Foundational (schema + helpers)
3. Phase 3: US1 (webhook + middleware + testes de isolamento)
4. Phase 4: US2 (convite-fechado + /admin/convites + addInvite/removeInvite)
5. **STOP**: testar com 1 amigo real
6. Deploy → convidar

### Incremental

- Stage 1: Setup + Foundational + US1 + US2 → primeiro amigo entra
- Stage 2: + US3 → owner tem painel agregado
- Stage 3: + US4 → dívida audit fechada
- Stage 4: Polish + merge

### Notes

- Commit após cada phase.
- Task T008-T010 são o coração da feature — validar bem com test
  integration antes de passar pra US2.
- Se o import do piloto 001 ainda estiver rodando no momento de T006,
  a migração ADD COLUMN em users é metadata-only (safe em libsql
  online). Migração de `playlists` requer tabela vazia (confirmado em
  T024).
