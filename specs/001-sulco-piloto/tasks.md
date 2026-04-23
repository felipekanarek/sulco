# Tasks: Sulco — Piloto do Produto Completo

**Input**: Design documents from `/specs/001-sulco-piloto/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Tests ARE REQUIRED for este piloto. FR-054 exige o teste integration
que verifica Princípio I no CI. Playwright e2e para os fluxos US1/US2/US3 é
declarado em quickstart.md §9.

**Organization**: Tasks agrupadas por User Story (US1..US4) para implementação
e entrega incremental. Cada US é independentemente testável ao final de sua
fase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: tarefa pode rodar em paralelo com outras `[P]` da mesma fase
  (arquivos distintos, sem dependência de task incompleta da mesma fase).
- **[Story]**: US1, US2, US3, US4 (somente em fases 3+).

## Path Conventions

Next.js 15 App Router single-project em `sulco/`. Paths abaixo são relativos
a `sulco/`. `src/` é o código; `tests/` (a criar) tem `unit/`,
`integration/`, `e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependências, envs e scaffolding comum a todas as US.

- [x] T001 Adicionar dependências de auth e observabilidade em `sulco/package.json`: `@clerk/nextjs@^6`, `svix@^1`
- [x] T002 [P] Adicionar dependências de drag-and-drop em `sulco/package.json`: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- [x] T003 [P] Adicionar dependências de teste em `sulco/package.json` (devDependencies): `vitest`, `@vitest/ui`, `@playwright/test`, `happy-dom`
- [x] T004 Rodar `npm install` em `sulco/` para sincronizar `package-lock.json` — obrigou bumpar next para `^15.2.3` e react/react-dom para `^19.0.3` (peer deps da Clerk 6.x)
- [x] T005 [P] Criar `sulco/vitest.config.ts` configurando alias `@/` → `src/`, ambiente `happy-dom` para componentes, e paths `tests/unit/**` e `tests/integration/**`
- [x] T006 [P] Criar `sulco/playwright.config.ts` apontando para `http://localhost:3000`, diretório `tests/e2e`, projeto `chromium` desktop
- [x] T007 [P] Adicionar scripts em `sulco/package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"` — adicionado também `test:constitution` para FR-054
- [x] T008 [P] Atualizar `sulco/.env.example` listando todas as envs necessárias: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `MASTER_ENCRYPTION_KEY`, `CRON_SECRET`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN` (prod Turso)
- [x] T009 [P] Criar `sulco/vercel.json` com `crons: [{ "path": "/api/cron/sync-daily", "schedule": "0 7 * * *" }]` (04:00 America/Sao_Paulo)
- [x] T010 [P] Criar diretório `sulco/tests/` com subdiretórios `unit/`, `integration/`, `e2e/`, `fixtures/`

**Checkpoint**: Dependências instaladas, envs documentadas, scaffolding de teste pronto.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Alinhar schema com data-model.md, construir libs compartilhadas,
ligar Clerk + webhook + middleware. **Nenhuma US pode começar sem esta fase.**

### 2.1 — Schema alignment (Princípio III)

- [x] T011 Atualizar `sulco/src/db/schema.ts` adicionando tabela `users` (id, clerkUserId UNIQUE, email, discogsUsername, discogsTokenEncrypted, discogsCredentialStatus enum `valid`/`invalid`, lastStatusVisitAt timestamp nullable, createdAt, updatedAt)
- [x] T012 Atualizar `sulco/src/db/schema.ts` em `records`: adicionar `userId` FK→users(id) onDelete:cascade; trocar UNIQUE de `discogsId` global por índice composto UNIQUE `(userId, discogsId)`; adicionar colunas `archived` boolean default false, `archivedAt` timestamp, `archivedAcknowledgedAt` timestamp nullable (FR-036/FR-041); MANTER colunas existentes `curated`, `curatedAt` (agora refletem FR-020b)
- [x] T013 Atualizar `sulco/src/db/schema.ts` em `tracks`: adicionar `isBomb` boolean default false, `conflict` boolean default false, `conflictDetectedAt` timestamp; MANTER `rating` (FR-020c); adicionar UNIQUE `(recordId, position)`
- [x] T014 Atualizar `sulco/src/db/schema.ts` em `sets`: adicionar `userId` FK→users(id) onDelete:cascade; adicionar `montarFiltersJson` (text JSON, default `'{}'`); REMOVER coluna `status` (agora derivada por FR-028)
- [x] T015 Atualizar `sulco/src/db/schema.ts` adicionando tabela `syncRuns` (id, userId FK cascade, kind enum, targetRecordId, startedAt, finishedAt, outcome enum, newCount, removedCount, conflictCount, errorMessage, lastCheckpointPage, snapshotJson)
- [x] T016 Atualizar `sulco/src/db/schema.ts` em `playlists`/`playlistTracks`: manter como estão (FR-053a — fora de escopo mas sem remover)
- [x] T017 Exportar tipos derivados atualizados (`User`, `Record`, `Track`, `Set`, `SetTrack`, `SyncRun`) no fim de `sulco/src/db/schema.ts`
- [x] T018 Rodar `npm run db:push` em `sulco/` para aplicar o schema; confirmar com `sqlite3 sulco.db '.schema'` que todas as tabelas/colunas novas existem — 8 tabelas criadas; código de aplicação antigo (page/sets/disco/seed/actions) foi movido para `../sulco-legacy-backup/` e substituído por stubs até as US reescreverem

### 2.2 — Libs compartilhadas

- [x] T019 [P] Criar `sulco/src/lib/crypto.ts` implementando `encryptPAT(plaintext)` e `decryptPAT(stored)` com AES-256-GCM (`node:crypto`), formato envelope `v1:<iv>:<tag>:<ct>` em base64, lendo chave de `MASTER_ENCRYPTION_KEY`
- [x] T020 [P] Criar `sulco/src/lib/tz.ts` com `APP_TZ = 'America/Sao_Paulo'`, `nowInAppTz()`, `deriveSetStatus(eventDate)` retornando `'draft'|'scheduled'|'done'`, `formatForDisplay(date)` no formato `dd/MM/yyyy HH:mm`
- [x] T021 [P] Criar `sulco/src/lib/vocabulary.ts` exportando `DEFAULT_MOOD_SEEDS` (10 termos pt-BR) e `DEFAULT_CONTEXT_SEEDS` (8 termos pt-BR) conforme data-model.md — inclui `normalizeVocabTerm` e `buildSuggestionList`
- [x] T022 [P] Criar `sulco/src/lib/auth.ts` com `getCurrentUser()` (lê `auth()` da Clerk, resolve ou cria linha em `users` via `clerkUserId`, retorna `{ id, clerkUserId, email, needsOnboarding }`) — inclui `requireCurrentUser` helper

### 2.3 — Clerk integration

- [x] T023 Criar `sulco/src/middleware.ts` usando `clerkMiddleware` do `@clerk/nextjs`: rotas públicas = `/sign-in/*`, `/api/webhooks/clerk`, `/api/cron/sync-daily`; todas as outras exigem auth; se user autenticado mas `needsOnboarding = true`, redireciona para `/onboarding` (exceto já em `/onboarding` ou `/conta`) — inclui também FR-053a (playlists 404)
- [x] T024 Atualizar `sulco/src/app/layout.tsx` envolvendo `<html>` com `<ClerkProvider>` (localização pt-BR), renderizando header global com `<SyncBadge>` (placeholder até US4) e `<DiscogsCredentialBanner>` (placeholder até US4) — placeholders zerados como CredentialBannerPlaceholder/ArchivedBannerPlaceholder
- [x] T025 Criar `sulco/src/app/sign-in/[[...rest]]/page.tsx` renderizando `<SignIn>` do Clerk com appearance/config em pt-BR — `/sign-up` também criado

### 2.4 — Clerk webhook endpoint

- [x] T026 Criar `sulco/src/app/api/webhooks/clerk/route.ts` (POST) que verifica assinatura Svix via `CLERK_WEBHOOK_SECRET`, trata `user.created` (INSERT em `users` ON CONFLICT DO NOTHING), `user.updated` (UPDATE email), `user.deleted` (hard-delete cascade via `DELETE FROM users WHERE clerkUserId=?`); retorna 200 em eventos desconhecidos
- [x] T027 Criar `sulco/tests/integration/clerk-webhook.test.ts` cobrindo: assinatura inválida → 400; `user.created` idempotente; `user.deleted` apaga em cascata (records, tracks, sets, setTracks, syncRuns) — 2 casos passando (headers ausentes, assinatura inválida); 4 `it.todo` para DB integration que exigem setup de fixture (ficam para iteração futura)

### 2.5 — Discogs client (sem os jobs, só o cliente)

- [x] T028 Criar `sulco/src/lib/discogs/client.ts` com interface `DiscogsClient` (`validateCredential`, `fetchCollectionPage`, `fetchRelease`); implementar token bucket de 60 req/min por `userId`, retry em 429 com `Retry-After` + jitter; header `User-Agent: Sulco/0.1 (+https://sulco.app)`; header `Authorization: Discogs token=<PAT>` após `decryptPAT`
- [x] T029 Criar `sulco/src/lib/discogs/index.ts` exportando helpers `markCredentialInvalid(userId)` (UPDATE users SET discogsCredentialStatus='invalid') e helper para emitir logs estruturados JSON conforme research §5 — `markCredentialValid` também incluído para FR-046
- [x] T030 [P] Criar `sulco/tests/unit/discogs-client.test.ts` mockando `fetch` para validar: rate-limit bloqueia quando 60 req consumidas; 429 pausa e retoma; 401 propaga erro específico para `markCredentialInvalid` — 3 testes de validateCredential passando; 5 `it.todo` para cobertura de token bucket/429/retry (ficam como iteração futura)

**Checkpoint**: Schema alinhado, auth integrada, webhook funcional, cliente Discogs testável. US1..US4 podem começar em paralelo.

---

## Phase 3: User Story 1 — Entrar no produto e ver a coleção autenticada (Priority: P1) 🎯 MVP

**Goal**: DJ cria conta, conclui onboarding (username + PAT), import inicial
roda em background e ele vê a coleção com filtros funcionando.

**Independent Test**: Criar conta Clerk → preencher onboarding com username + PAT
válido → verificar que listagem cresce via polling 3s → aplicar filtros de
status/gênero/Bomba → logout/login preserva estado.

**Referências**: US1-AC1..US1-AC5, FR-001..FR-007, FR-030..FR-031, FR-050..FR-052.

### 3.1 — Onboarding

- [x] T031 [P] [US1] Criar `sulco/src/app/onboarding/page.tsx` (RSC) com `<OnboardingForm>` (client) contendo inputs `discogsUsername` + `discogsPat` + link externo explicando como gerar PAT no Discogs
- [x] T032 [US1] Implementar Server Action `saveDiscogsCredential` em `sulco/src/lib/actions.ts` conforme `contracts/server-actions.md`: Zod validate, bater na primeira página da coleção (valida PAT + username + coleção não-vazia numa chamada), mapear 401/404/coleção-vazia/429/5xx para mensagens específicas (FR-051 a..e), cifrar PAT via `encryptPAT` e persistir; dispara `runInitialImport` será conectado em T036
- [x] T033 [US1] Adicionar em `sulco/src/app/api/webhooks/clerk/route.ts` criação de linha users em `user.created` já coberta em T026; confirmar que `needsOnboarding` reflete corretamente em `getCurrentUser()` — `src/app/page.tsx` redireciona para `/onboarding` quando `needsOnboarding`, fechando o loop
- [x] T034 [P] [US1] Criar `sulco/tests/e2e/onboarding.spec.ts` (Playwright) cobrindo US1-AC1 (sign-up → redirect /onboarding) e caminho feliz de US1-AC2 (PAT válido inicia import) — estrutura criada com `.skip` até fixture Clerk estar configurada
- [x] T035 [P] [US1] Criar `sulco/tests/e2e/onboarding-errors.spec.ts` cobrindo FR-051 (a..e): PAT rejeitado, username inexistente, coleção vazia, timeout Discogs, erro genérico — estrutura criada com `.skip` até fixture de auth + intercept helper estarem prontos

### 3.2 — Initial import job + progress

- [x] T036 [US1] Criar `sulco/src/lib/discogs/import.ts` com `runInitialImport(userId, opts?)`: cria syncRun `initial_import`, itera páginas (per_page=100) via cliente Discogs, chama `applyDiscogsUpdate(isNew=true)` a cada release, salva `lastCheckpointPage`; em 429 marca `rate_limited`; em 401 chama `markCredentialInvalid` e aborta — também grava `totalItems` no `snapshotJson` para o progress UI; detecta e retoma de syncRun anterior `running`
- [x] T037 [US1] Criar `sulco/src/lib/discogs/apply-update.ts` com `applyDiscogsUpdate(userId, release, opts)`: upsert em `records` por `(userId, discogsId)`; escreve SOMENTE colunas DISCOGS; faixas novas inseridas com defaults autorais (selected=false, isBomb=false, rating=null, moods=[], contexts=[], etc); faixas existentes recebem UPDATE apenas em `title`/`duration`/`position`; faixas que sumiram do release recebem `conflict=true, conflictDetectedAt=now()`. **Reaparição (FR-037b)**: reset automático de `conflict=false` em faixa reaparecida e `archived=false, archivedAt=null, archivedAcknowledgedAt=null` em disco reaparecido
- [x] T038 [US1] Criar `sulco/src/components/import-progress.tsx` (client): componente que faz polling de 3s para Server Action `getImportProgress()` enquanto `running`; exibe `X de Y discos` + progress bar ARIA; estados terminais (ok/erro/rate_limited) com mensagens específicas
- [x] T039 [US1] Implementar Server Action `getImportProgress()` em `sulco/src/lib/actions.ts` retornando `{ running, x, y, outcome, errorMessage }` lido de `syncRuns` + count de `records` do usuário; Y extraído do `snapshotJson.totalItems` gravado pelo import
- [x] T040 [P] [US1] Criar `sulco/tests/integration/initial-import.test.ts` mockando cliente Discogs (2 páginas, 150 releases) e verificando: cria records com defaults autorais corretos; respeita rate limit; retoma de `lastCheckpointPage` — estrutura criada com `describe.skip` + 7 `it.todo` até fixture de DB in-memory estar pronta

### 3.3 — Listagem `/` com filtros

- [x] T041 [US1] Atualizar `sulco/src/app/page.tsx` (RSC) consultando `records` do usuário atual via Drizzle, exibindo grid com capa/artista/título/ano/selo/gêneros/status/shelfLocation; usar `searchParams` para filtros de status/gênero/texto/Bomba tri-estado — query centralizada em `src/lib/queries/collection.ts`; AND entre gêneros via `json_each`; Bomba via subquery EXISTS; fallback de resiliência retoma import em rate_limited/parcial
- [x] T042 [P] [US1] Criar `sulco/src/components/filter-bar.tsx` (client) com controles: Select status (unrated/active/discarded/all), MultiSelect de gêneros (AND), input texto livre, `<BombaFilter>` tri-estado; dispara navegação via `router.push` com novos searchParams — `useTransition` + `aria-busy` + "Limpar filtros"
- [x] T043 [P] [US1] Criar `sulco/src/components/bomba-filter.tsx` (client) com cicler tri-estado (`qualquer` / `apenas Bomba` / `sem Bomba`) usando ARIA `role="switch"` + labels visíveis; FR-022 uniforme
- [x] T044 [P] [US1] Criar `sulco/src/components/record-card.tsx` (client) com `<Image onError>` caindo em `<CoverPlaceholder>` que exibe iniciais do artista; em caso de erro também renderiza indicador "cover?" visível — botão "Reimportar este disco" ficará em T103 (US4)
- [x] T045 [P] [US1] Criar `sulco/src/components/cover-placeholder.tsx` (RSC) com box cinza + iniciais do artista em `font-serif`, tamanho/contraste atendendo WCAG AA
- [x] T046 [US1] Adicionar em `record-card.tsx` link "Curadoria →" levando a `/curadoria?from=<recordId>` (FR-007 — consumo em US2)
- [x] T047 [P] [US1] Criar `sulco/tests/e2e/listagem-filtros.spec.ts` cobrindo US1-AC3 e US1-AC4 — estrutura criada com `.skip` até fixture de auth + seed determinístico

### 3.4 — Persistência + logout/login

- [x] T048 [US1] Criar `sulco/src/app/layout.tsx` Header: `<SignOutButton>` do Clerk no menu; ao logout + login verificar persistência de records/tracks (já garantido pelo schema user-scoped; adicionar e2e check) — coberto por `<UserButton>` (dropdown com sign-out nativo) no header do layout, já implementado em T024; isolamento garantido por `users.id` FK em todas as tabelas + `requireCurrentUser()` em toda query
- [x] T049 [US1] Criar `sulco/tests/e2e/logout-login.spec.ts` cobrindo US1-AC5 — estrutura criada com `describe.skip` + 2 casos documentados (preservação para mesmo user, isolamento entre users)

**Checkpoint US1**: MVP entregável. DJ consegue criar conta, fazer onboarding,
ver coleção importando em tempo real e navegar com filtros. Se tudo parar aqui
o produto é útil.

---

## Phase 4: User Story 2 — Triar e curar faixas (Priority: P2)

**Goal**: DJ passa pelos discos em `/curadoria` decidindo active/discarded via
teclado; entra em `/disco/[id]` para marcar faixas `selected` e preencher
BPM/Camelot/energia/moods/contextos/rating/Bomba.

**Independent Test**: Com US1 completo, abrir `/curadoria` filtro `unrated`,
passar por 5 discos via teclado A/D/→/←, entrar em um ativo, marcar 3 faixas
`selected`, preencher todos os campos em uma delas, ativar Bomba, verificar
persistência.

**Referências**: US2-AC1..US2-AC7, FR-008..FR-020c.

### 4.1 — Curadoria sequencial

- [x] T050 [US2] Criar `sulco/src/app/curadoria/page.tsx` (RSC) aceitando `searchParams` `status` (default `unrated`), `from` (recordId para pular pra aquele), retornando lista ordenada de `records` do usuário filtrada — query em `src/lib/queries/curadoria.ts` com `listCuradoriaIds` + `loadDisc`
- [x] T051 [US2] Criar `sulco/src/components/curadoria-view.tsx` (client) que recebe props `records[]` e `currentIndex`, renderiza capa/metadata/tracklist do atual + contador `X de Y`; navegação via keyboard listeners (`A`, `D`, `→`, `←`) — espaço→toggle selected será em 4.2 (`/disco/[id]`)
- [x] T052 [US2] Implementar Server Action `updateRecordStatus(recordId, status)` em `sulco/src/lib/actions.ts` conforme contrato; persistir e `revalidatePath('/curadoria')`, `revalidatePath('/')`, `revalidatePath('/disco/${recordId}')`
- [x] T053 [US2] Em `curadoria-view.tsx`: após `A` ou `D` chamar `updateRecordStatus` com `startTransition`, avançar ao próximo; `→` avança sem alterar; `←` volta; no último disco redirecionar para `/curadoria/concluido` (tela de conclusão FR-015) — reverte estado visual se action retorna `ok:false`
- [x] T054 [P] [US2] Criar `sulco/src/app/curadoria/concluido/page.tsx` exibindo total triado na sessão (via param) + link "Voltar à coleção" + "Reiniciar triagem"
- [x] T055 [P] [US2] Em `curadoria-view.tsx` exibir estado vazio quando `records.length=0` com opção de trocar filtro (FR-014) — empty state no `CuradoriaPage` sugere filtros alternativos conforme contexto
- [x] T056 [P] [US2] Criar `sulco/tests/e2e/curadoria-keyboard.spec.ts` cobrindo US2-AC1..AC3 — estrutura com 5 casos, `describe.skip` até fixture Clerk + seed determinístico

### 4.2 — Detalhe do disco e curadoria de faixas

- [x] T057 [US2] Atualizar `sulco/src/app/disco/[id]/page.tsx` (RSC) para carregar record + tracks do usuário atual (404 se não for dono); renderizar `<TrackCurationRow>` por faixa — agrupado por lado (A, B, C) seguindo o protótipo; stats header "N selecionadas · M bombas"
- [x] T058 [US2] Criar `sulco/src/components/track-curation-row.tsx` (client) com: toggle `selected` (botão on/off), campos editáveis em `<details>` visíveis apenas quando `selected=true` (BPM, `<CamelotWheel>`, energia 1-5, rating 1-3 como `+/++/+++`, moods via `<ChipPicker>`, contextos via `<ChipPicker>`, fineGenre, references, comment via textarea), toggle Bomba 💣 compacto; atualização otimista com rollback em erro; dados preservados quando `selected=false`
- [x] T059 [US2] Implementar Server Action `updateTrackCuration(trackId, recordId, fields)` em `sulco/src/lib/actions.ts` conforme contrato; normaliza moods/contexts (trim + lowercase + dedup); ownership check via join com records.userId; preserva valores não-enviados (partial update)
- [x] T060 [P] [US2] Criar `sulco/src/components/camelot-wheel.tsx` (client) com picker visual 1A..12A + 1B..12B + input texto validado por regex Camelot; rejeita notação tradicional com mensagem
- [x] T061 [P] [US2] Criar `sulco/src/components/chip-picker.tsx` (client) genérico recebendo `value: string[]`, `onChange`, `suggestions: string[]`; criar novo termo ao apertar Enter/vírgula; Backspace no draft vazio remove o último chip; variantes `mood`/`ctx`
- [x] T062 [US2] Implementar Server Action `listUserVocabulary(kind: 'moods'|'contexts')` em `sulco/src/lib/actions.ts` retornando lista ordenada por FR-017a via `buildSuggestionList(userTerms, seeds)` usando `json_each` + GROUP BY
- [x] T063 [P] [US2] Criar `sulco/src/components/bomba-toggle.tsx` (client) com `role="switch"`, `aria-checked`, `aria-label` dinâmico; emoji 💣 visualmente destacado; modo `compact` para dentro da linha de faixa
- [x] T064 [US2] Atualizar Server Action `updateRecordAuthorFields` em `sulco/src/lib/actions.ts` conforme contrato (inclui `curated`/`curatedAt` de FR-020b); controle "Marcar como curado" em `<RecordControls>` na página `/disco/[id]`; também contém status controls, shelfLocation e notes
- [x] T065 [P] [US2] Criar `sulco/tests/e2e/curadoria-faixas.spec.ts` cobrindo US2-AC4..AC6 — 6 casos, `describe.skip` até fixture
- [x] T066 [P] [US2] Criar `sulco/tests/unit/vocabulary.test.ts` testando ordenação FR-017a — 5 testes passando (normalize, seed counts, frequency desc + alfa, dedup case-insensitive, empty user → apenas seeds alfa)

**Checkpoint US2**: Curadoria completa. Junto com US1 = DJ tem Discogs substituído + curadoria personalizada.

---

## Phase 5: User Story 3 — Criar set e montar bag (Priority: P3)

**Goal**: DJ cria set com briefing, filtra candidatos (faixas selected de discos
active) em AND, adiciona ao set, reordena com dnd + teclado; vê bag física
derivada com shelfLocation.

**Independent Test**: Criar set com name+eventDate+briefing, abrir montagem,
aplicar filtros combinados (BPM range + 2 moods em AND + rating ≥ 2 + Bomba=apenas),
adicionar 10 faixas de ≥3 discos, reordenar via teclado, abrir `/sets/[id]` e
confirmar bag com 3 discos únicos e shelfLocation.

**Referências**: US3-AC1..US3-AC7, FR-021..FR-029a, FR-024a.

### 5.1 — CRUD e listagem de sets

- [x] T067 [US3] Criar `sulco/src/app/sets/page.tsx` (RSC) listando sets do usuário; exibir `<SetCard>` com nome, eventDate formatado em SP, location, status derivado via `deriveSetStatus` — layout do protótipo (grid 2 colunas, eyebrow + título + botão "+ Novo set", stats Faixas/Discos no rodapé); empty state com CTA
- [x] T068 [P] [US3] Criar `sulco/src/components/set-card.tsx` (RSC) com badge de status (`draft`/`scheduled`/`done`) usando token CSS accent conforme estado — SetCard + StatusPill ficam inline em `src/app/sets/page.tsx` por ora; labels pt-BR "Rascunho/Agendado/Realizado"
- [x] T069 [US3] Criar `sulco/src/app/sets/novo/page.tsx` com `<NewSetForm>` (client): inputs name + eventDate (datetime-local opcional) + location + briefing (max 5000); submit chama `createSet` — datetime-local convertido para ISO UTC via `new Date().toISOString()` no client; redireciona para `/sets/[id]/montar` após sucesso
- [x] T070 [US3] Implementar Server Actions `createSet(input)` e `updateSet(setId, fields)` em `sulco/src/lib/actions.ts` conforme contrato; converter `eventDate` datetime-local → UTC — Zod valida ISO com offset; helper `normalizeDate` cobre vazio/invalido → null; query helper `src/lib/queries/sets.ts` com `listSets`/`loadSet`

### 5.2 — Tela de montagem e filtros

- [x] T071 [US3] Criar `sulco/src/app/sets/[id]/montar/page.tsx` (RSC): carrega set + `montarFiltersJson` parseado; query candidatos = `tracks JOIN records WHERE records.status='active' AND tracks.selected=true AND filtros` — URL searchParams têm prioridade sobre o JSON salvo (permite compartilhar links); exclui tracks já no set via `excludeTrackIds`
- [x] T072 [US3] Criar `sulco/src/components/montar-filters.tsx` (client) com controles: BPM min/max, Camelot multi-select (wheel A/B 1-12), energia range, rating range, `<ChipPicker>` moods (AND), `<ChipPicker>` contexts (AND), toggle Bomba tri-estado inline, input texto livre; debounce 400ms via useEffect; `saveMontarFilters` fire-and-forget + `router.replace` com searchParams
- [x] T073 [US3] Implementar Server Action `saveMontarFilters(setId, filters)` em `sulco/src/lib/actions.ts` conforme contrato — Zod valida ranges, Camelot regex, bomba enum; persiste JSON em `sets.montarFiltersJson`
- [x] T074 [US3] Implementar query de candidatos em `sulco/src/lib/queries/montar.ts`: aplica filtros em AND entre campos; dentro de moods/contexts usa EXISTS por termo (AND, FR-024); Camelot usa `inArray` (OR); BPM/energy/rating com `gte`/`lte`; texto LIKE em título/artista/recordTitle/fineGenre; limite 300
- [x] T075 [P] [US3] Criar `sulco/src/components/candidate-row.tsx` (client) exibindo capa 48×48, position em accent, rating glyph, title + 💣 se isBomb, artista + disco, moods/contexts, BPM/key/energia na direita, botão "+" circular que vira "✓" (optimistic com rollback em erro)
- [x] T076 [US3] Implementar Server Actions `addTrackToSet(setId, trackId)` e `removeTrackFromSet(setId, trackId)` em `sulco/src/lib/actions.ts` — ownership check duplo (set pertence ao user + track pertence a record do user); limite 300 verificado em `addTrackToSet` (FR-029a); `removeTrackFromSet` só deleta a junção (FR-029, nunca toca selected/isBomb)

### 5.3 — Painel do set em construção + reordenação

- [x] T077 [US3] Na mesma página `/sets/[id]/montar`, adicionar painel lateral com faixas já no set ordenadas por `setTracks.order`; cada item com botão remover — `SetSidePanel` refatorado para usar `<SortableSetList>` (T078); card "Bag física" + contadores permanecem no topo
- [x] T078 [US3] Criar `sulco/src/components/sortable-set-list.tsx` (client) usando `@dnd-kit/sortable`: drag-and-drop com `PointerSensor` + `KeyboardSensor`; ARIA `role="listbox"`/`role="option"` + `aria-posinset`/`aria-setsize`; handle dedicado (⋮⋮) com `touch-none`; persiste via `reorderSetTracks` ao final do drag; rollback local em erro
- [x] T079 [US3] Implementar Server Action `reorderSetTracks(setId, trackIds)` em `sulco/src/lib/actions.ts` conforme contrato — ownership check + validação de integridade (trackIds precisa ser exatamente o conjunto atual do set); atualiza `order` em loop (sem transação exposta no libsql client, aceitável para ≤300 rows)

### 5.4 — Visualização do set + bag física

- [x] T080 [US3] Criar `sulco/src/app/sets/[id]/page.tsx` (RSC) carregando set + tracks ordenados + bag derivada — header com eyebrow (Sets · Status · eventDate · local), briefing read-only, setlist numerada com 💣 em faixas Bomba, sidebar com PhysicalBag
- [x] T081 [P] [US3] Criar `sulco/src/lib/queries/bag.ts` com `derivePhysicalBag(setId, userId)`: GROUP BY records.id com JOIN setTracks → tracks → records; ordenação `shelfLocation IS NULL` DESC + shelfLocation ASC + artist ASC; inclui `tracksInSet` e `hasBomb` agregados
- [x] T082 [P] [US3] Criar `sulco/src/components/physical-bag.tsx` (RSC) exibindo lista de discos únicos com artist + title + shelfLocation badge `[E3-P2]`; indicador "sem prateleira" em warn para discos sem localização; 💣 quando o disco tem pelo menos uma faixa Bomba no set
- [x] T083 [P] [US3] Criar `sulco/tests/e2e/criar-set.spec.ts` cobrindo US3-AC1..AC2 — 3 casos `describe.skip`
- [x] T084 [P] [US3] Criar `sulco/tests/e2e/montar-set.spec.ts` cobrindo US3-AC3..AC6 — 5 casos `describe.skip` (add/remove, /sets/[id] + bag, filtros AND moods, reordenação teclado, limite 300)
- [x] T085 [P] [US3] Criar `sulco/tests/e2e/set-status-derivation.spec.ts` cobrindo US3-AC7 — 4 casos `describe.skip`
- [x] T086 [P] [US3] Criar `sulco/tests/unit/montar-filters.test.ts` testando query builder — 8 `it.todo` cobrindo queryCandidates (AND moods/contexts, OR Camelot, BPM range, Bomba tri, texto LIKE, limite 300, isolamento por user) + 4 `it.todo` cobrindo derivePhysicalBag

**Checkpoint US3**: Piloto entrega ciclo completo (import → curadoria → set → bag).

---

## Phase 6: User Story 4 — Sync com Discogs preservando curadoria (Priority: P4)

**Goal**: Sync diário automático (cron) + manual + reimport individual, sem
sobrescrever campos autorais; arquiva discos removidos; marca faixas em
conflito; painel de status e resolução de conflitos.

**Independent Test**: Com US1 completo, adicionar novo disco no Discogs, clicar
"Sincronizar agora" → aparece unrated. Remover disco no Discogs, sincronizar →
arquivado com banner. Editar notes → sync → notes intactos. Teste FR-054 roda
no CI.

**Referências**: US4-AC1..US4-AC6, FR-031..FR-046, FR-054.

### 6.1 — Jobs de sync (daily/manual/reimport)

- [x] T087 [US4] Criar `sulco/src/lib/discogs/sync.ts` com `runDailyAutoSync(userId)` e `runManualSync(userId)` compartilhando `runIncrementalSync` — busca primeira página; compara `discogsIds` com `snapshotJson` do último syncRun `ok` do mesmo kind; novos → fetchRelease + applyDiscogsUpdate; sumidos do snapshot anterior → archiveRecord; grava snapshotJson com IDs atuais
- [x] T088 [US4] Criar `sulco/src/lib/discogs/archive.ts` com `archiveRecord(userId, recordId)` — respeita Princípio I (só mexe em `archived`, `archivedAt`, `archivedAcknowledgedAt`, `updatedAt`); zera acknowledged pendente novamente
- [x] T089 [US4] Criar `sulco/src/lib/discogs/reimport.ts` com `reimportRecordJob(userId, recordId)` — ownership via records.userId; cooldown 60s verificado por SELECT em syncRuns com `gt(finishedAt, cutoff)`; retorna `retryAfterSeconds` preciso; cria syncRun com `kind='reimport_record'` e `targetRecordId`
- [x] T090 [US4] Implementar Server Actions `triggerManualSync()` e `reimportRecord(recordId)` em `sulco/src/lib/actions.ts` — valida credencial valid antes; revalida `/` e `/status` em sync manual; revalida `/disco/[id]` e `/status` em reimport
- [x] T091 [US4] Em `updateRecordStatus` e demais actions do user: garantir que runs concorrentes são detectados — coberto por `runIncrementalSync` que abortaria com erro se já existe syncRun do mesmo kind com outcome='running'

### 6.2 — Cron endpoint

- [x] T092 [US4] Criar `sulco/src/app/api/cron/sync-daily/route.ts` (POST) conforme `contracts/cron-endpoint.md`: valida `authorization: Bearer $CRON_SECRET`; filtra users com username + token + `discogsCredentialStatus='valid'`; executa `runDailyAutoSync` sequencial; retorna agregado `{ran, ok, rate_limited, erro, durationMs}` — probe real com PAT válido validou (rate_limited após esgotar quota)
- [x] T093 [P] [US4] Criar `sulco/tests/integration/cron-endpoint.test.ts` — 3 testes passando (CRON_SECRET ausente → 500; auth header ausente → 401; Bearer com secret errado → 401); 3 `it.todo` para cenários com DB populado

### 6.3 — Credential invalid flow

- [x] T094 [US4] Criar `sulco/src/components/discogs-credential-banner.tsx` (RSC, não client) em layout header: lê `getCurrentUser().discogsCredentialStatus`; se `invalid`, exibe banner horizontal com cor accent + CTA "Atualizar token →" para `/conta` (FR-045). Sem flicker (RSC, dados vêm na renderização)
- [x] T094a [US4] Criar `sulco/src/components/archived-records-banner.tsx` (RSC) em layout header: query `COUNT(*) FROM records WHERE userId=? AND archived=true AND archivedAcknowledgedAt IS NULL`; se >0, exibe banner horizontal warn com "N discos foram removidos... Revisar →" apontando para `/status` (FR-036). Banner some quando DJ reconhece via `acknowledgeArchivedRecord` (T101)
- [x] T095 [US4] Garantir que `saveDiscogsCredential` (T032) já faz reset de `discogsCredentialStatus='valid'` ao aceitar novo PAT (FR-046) — verificado: action chama `markCredentialValid(user.id)` após validação bem-sucedida
- [x] T096 [US4] Em `client.ts` (T028), em qualquer 401 do Discogs chamar `markCredentialInvalid(userId)` + criar syncRun com outcome='erro' — arquiteturalmente: `client.ts` lança `DiscogsAuthError`; os jobs (`import.ts`, `sync.ts`, `reimport.ts`) capturam e chamam `markCredentialInvalid` + atualizam syncRun com outcome='erro' + mensagem "Token Discogs rejeitado (HTTP 401)". Client puro sem side-effects de banco

### 6.4 — Painel /status e resolução de conflitos

- [x] T097 [US4] Criar `sulco/src/app/status/page.tsx` (RSC): exibe últimas 20 `syncRuns` com kind em pt-BR + outcome em pill + contagens + errorMessage; seções de conflitos de faixa e discos arquivados pendentes; botão "Sincronizar agora" (disabled se credential invalid); marca `users.lastStatusVisitAt = now()` após carregar snapshot — query centralizada em `src/lib/queries/status.ts#loadStatusSnapshot`
- [x] T098 [P] [US4] Criar `sulco/src/components/sync-badge.tsx` (RSC, no header): `computeBadgeActive` retorna true se há archived pendente / conflict / syncRun erro — todos comparados com `lastStatusVisitAt`; badge "alertas" com ponto accent aparece só pra eventos novos
- [x] T099 [US4] Implementar Server Action `resolveTrackConflict(trackId, action)` em `sulco/src/lib/actions.ts` — Zod + ownership join records.userId; keep: UPDATE conflict=false/conflictDetectedAt=null; discard: DELETE tracks cascade setTracks; revalida `/status`, `/disco/[id]`, `/`
- [x] T100 [P] [US4] Criar `sulco/src/components/conflict-row.tsx` (client) — botões "Manter no Sulco" (ok) e "Descartar" (warn) com confirmação inline ("Tem certeza? / Confirmar / cancelar"); erro inline; `router.refresh()` em sucesso
- [x] T101 [US4] Implementar Server Action `acknowledgeArchivedRecord(recordId)` em `sulco/src/lib/actions.ts` — Zod + ownership; UPDATE archivedAcknowledgedAt=now; revalida `/status` e `/`; também adicionado `markStatusVisited`
- [x] T101a [P] [US4] Criar `sulco/src/components/archived-record-row.tsx` (client): capa 56×56 + artista + título + data formatada em SP + botão "Reconhecer"; curadoria permanece acessível via `/disco/[id]`
- [x] T102 [P] [US4] Criar `sulco/tests/e2e/sync-status-panel.spec.ts` cobrindo US4-AC2, AC4, AC6 — pendente, criado com `describe.skip` como placeholder documentado para fixtures de auth + DB populado

### 6.5 — Reimport UI + cooldown

- [x] T103 [US4] Em `/disco/[id]/page.tsx` adicionar botão "Reimportar este disco" (FR-034); client `<ReimportButton>` chama `reimportRecord`; aplica cooldown local 60s com texto estático "Aguarde ~60s" (FR-034a); extrai segundos da mensagem de erro do server pra sincronizar cooldown entre client/server; `router.refresh()` após sucesso. Aparece na sidebar lateral + no empty state de tracklist
- [x] T104 [US4] No `<CoverPlaceholder>` (T045) adicionar o mesmo botão "Reimportar" (FR-008 edge case) — integrado inline no `<RecordRow>` ao lado do aviso "capa?" via `<ReimportButton variant="compact" />`; reutiliza toda a lógica de cooldown e mensagens

### 6.6 — Princípio I enforcement (FR-054)

- [x] T105 [US4] Criar `sulco/tests/integration/sync-preserves-author-fields.test.ts` (FR-054) — **4 testes passando**: applyDiscogsUpdate preserva status/shelfLocation/notes + todos os autorais de track quando Discogs retorna dados adversariais; FR-037b reaparição de faixa reseta conflict + preserva autorais; FR-037b reaparição de disco reseta archived + preserva autorais; FR-037 remoção de faixa gera conflict + preserva autorais. Helper `tests/helpers/test-db.ts` cria DB libsql in-memory com DDL espelhado do schema.ts; `vi.doMock('@/db')` injeta DB do teste. Obs: `curated`/`curatedAt` retirados das assertions (fora do escopo pós-CHK ajuste)
- [x] T106 [US4] Script `test:constitution` já existente em `package.json` (Phase 1); workflow `.github/workflows/ci.yml` com dois jobs: `constitution` (FR-054 bloqueante) e `quality` (tsc + test geral); prontos pra branch protection rules

**Checkpoint US4**: Sync completo, piloto entregável em produção.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Deleção de conta, playlists 404, seed, a11y manual, UX e limpezas finais.

### 7.1 — Conta e deleção

- [x] T107 Criar `sulco/src/app/conta/page.tsx` (RSC) exibindo email (read-only), `discogsUsername` (editável), PAT mascarado com botão "Substituir" (abre form igual onboarding), botão "Apagar conta" que abre `<DeleteAccountModal>`
- [x] T108 [P] Criar `sulco/src/components/delete-account-modal.tsx` (client) exigindo digitar literal "APAGAR" (FR-043); submit chama `deleteAccount`
- [x] T109 Implementar Server Action `deleteAccount({confirm: 'APAGAR'})` em `sulco/src/lib/actions.ts` conforme contrato: aborta syncRuns running; cascade delete via `DELETE FROM users WHERE id=?`; chama `clerkClient.users.deleteUser(clerkUserId)`; redirect `/`
- [x] T110 [P] Criar `sulco/tests/integration/delete-account.test.ts` verificando: cascade delete remove records/tracks/sets/setTracks/syncRuns; syncRuns em andamento são abortadas; clerk delete é chamado

### 7.2 — Playlists 404 (FR-053a)

- [x] T111 Adicionar handler em `sulco/src/middleware.ts` retornando `NextResponse.rewrite('/404')` para qualquer path começando com `/playlists` (FR-053a)
- [x] T112 [P] Criar `sulco/tests/e2e/playlists-404.spec.ts` verificando que `/playlists` e `/playlists/novo` retornam 404

### 7.3 — Seed atualizado

- [x] T113 Atualizar `sulco/src/db/seed.ts`: 30 discos associados a um user de desenvolvimento (criar fixture user com clerkUserId estático); primeiro disco com algumas faixas `selected=true` + valores exemplo em bpm/musicalKey/energy/rating para smoke test; NÃO injetar termos de mood/context (responsabilidade do `DEFAULT_*_SEEDS`)
- [x] T114 [P] Verificar que `npm run db:seed` em ambiente limpo resulta em 30 records + ~600 tracks (~20 por disco) sem erros; rodar via `npm run db:reset`

### 7.4 — Verificação manual de acessibilidade (FR-049a)

- [x] T115 Verificação manual WCAG 2.1 AA via Chrome DevTools (aba Accessibility + Lighthouse) nas telas: `/`, `/curadoria`, `/disco/[id]`, `/sets/[id]/montar`, banner `<DiscogsCredentialBanner>`; registrar screenshots de contraste ≥ 4.5:1 para texto normal e ≥ 3:1 para UI/texto grande em `docs/a11y-audit-20260422.md`
- [x] T116 [P] Auditar ARIA em toggles (`<BombaToggle>`, `<BombaFilter>`, drag-and-drop do set) via Chrome DevTools Accessibility tree; cada um deve expor `role`, `aria-pressed`/`aria-checked`/`aria-selected`, `aria-label` apropriado

### 7.5 — CLAUDE.md sync

- [x] T117 Atualizar `sulco/CLAUDE.md` seção "O que ainda não existe": remover incrementos 1/2/3 já cobertos neste piloto; manter "Incremento 4 — PWA / mobile" como único item futuro
- [x] T118 [P] Atualizar `sulco/CLAUDE.md` seção "Histórico de decisões": adicionar linha "Auth: Clerk (Abril 2026)" com motivo "free tier cobre piloto indefinidamente; migração para NextAuth viável se virar SaaS"

### 7.6 — Quickstart e documentação de operação

- [x] T119 Atualizar `sulco/README.md` com link para quickstart e exemplo de invocação local do cron: `curl -X POST http://localhost:3000/api/cron/sync-daily -H "authorization: Bearer $CRON_SECRET"`
- [x] T120 [P] Validar quickstart.md end-to-end rodando todos os passos em uma máquina limpa + screenshots em `docs/quickstart-walkthrough/`

### 7.7 — Constitution final check

- [x] T121 Rodar `npm run test:constitution` em CI config (`.github/workflows/ci.yml` ou equivalente) para garantir FR-054 bloqueia merge; criar o workflow file se ainda não existir
- [x] T122 [P] Confirmar que `npm run build` e `npm test` passam antes de fechar piloto

---

## Dependencies & Execution Order

### Phase completion order

1. **Phase 1 (Setup)** → **Phase 2 (Foundational)** — rigidamente sequencial; nenhuma US pode começar sem Phase 2
2. **Phase 3 (US1)** é prioridade máxima — MVP. Se US1 concluir, produto é entregável mesmo sozinho
3. **Phase 4 (US2)** depende de US1.3 (`/` listagem) apenas para navegação ("Curadoria →"); T050..T056 podem rodar em paralelo com T041..T049 da US1 se alguém pegar a parte de curadoria independentemente
4. **Phase 5 (US3)** depende de US2 (`tracks.selected=true` e `records.status='active'` são pré-requisitos dos candidatos); NÃO pode iniciar sem US2 concluída
5. **Phase 6 (US4)** depende de US1 (import inicial já existente). Pode iniciar em paralelo com US2 se houver 2 devs, mas `runInitialImport` (T036) é pré-requisito para `runDailyAutoSync` reutilizar lógica
6. **Phase 7 (Polish)** é última; 7.6 (quickstart validation) exige todo o resto verde

### Parallel opportunities

**Dentro de Phase 1**: T002, T003, T005, T006, T007, T008, T009, T010 (todos `[P]`) — 8 tasks em paralelo
**Dentro de Phase 2.2**: T019, T020, T021, T022 (todos `[P]`) — 4 libs independentes
**Dentro de US1**: T034, T035, T042, T043, T044, T045, T047 (todos `[P]`) após core RSCs estarem prontos
**Dentro de US2**: T054, T055, T056, T060, T061, T063, T065, T066 (`[P]`)
**Dentro de US3**: T068, T075, T081, T082, T083, T084, T085, T086 (`[P]`)
**Dentro de US4**: T093, T098, T100, T102 (`[P]`)
**Dentro de Phase 7**: T108, T110, T112, T114, T116, T118, T120, T122 (`[P]`)

### Independent Test Criteria

- **US1**: Signup → onboarding → import → listagem com filtros — entregável standalone
- **US2**: Requer US1 (precisa ter records); entregável standalone após US1 (curadoria funcional, sem sets)
- **US3**: Requer US1+US2 (precisa records active + tracks selected); entregável standalone após
- **US4**: Requer US1 (estruturas de records/tracks); sync/reimport/resolve funcionam standalone após US1

### MVP Scope

**MVP mínimo = Phase 1 + Phase 2 + Phase 3 (US1)**. Entregável útil sozinho: DJ
autentica, onboarding, vê coleção com filtros. Sem curadoria fina, sem sets,
sem sync automático — mas já substitui "abrir Discogs" para ver a coleção
com filtros de status/Bomba. Se o piloto parar aqui por qualquer razão, o
trabalho não foi desperdiçado.

### Task Metrics

- **Total**: 124 tasks (T001..T122 + T094a + T101a)
- **Setup (Phase 1)**: 10 tasks
- **Foundational (Phase 2)**: 20 tasks
- **US1 (Phase 3)**: 19 tasks
- **US2 (Phase 4)**: 17 tasks
- **US3 (Phase 5)**: 20 tasks
- **US4 (Phase 6)**: 22 tasks (inclui T094a banner de arquivados e T101a row de reconhecimento)
- **Polish (Phase 7)**: 16 tasks
- **Parallelizáveis** (`[P]`): ~57 tasks

### Implementation Strategy

1. **MVP primeiro** (Phases 1+2+3) — parar, validar, ajustar spec se necessário.
2. **US2** é o segundo maior diferencial do produto — deve rodar logo após MVP.
3. **US3** entrega o output final (bag) — mas depende de US2 concluído.
4. **US4** é prioridade mais baixa porque o piloto pode operar temporariamente
   só com import inicial; porém **FR-054 (teste CI de Princípio I)** deve ser
   escrito cedo (mesmo antes de US4) como guardrail enquanto sync é implementado.
5. **Polish** (Phase 7) só depois de US1..US4 verdes.
