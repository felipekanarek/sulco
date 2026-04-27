# Tasks: Responsividade mobile-first do Sulco (009)

**Input**: Design documents from `/specs/009-responsividade-mobile-first/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Inclusos. Component tests Vitest pra `<MobileDrawer>` (estado, scroll lock, ESC, overlay) + e2e Playwright em viewport mobile (375x667) cobrindo US1; visual diff manual em desktop pra anti-regressão (SC-004).

**Organization**: Tasks agrupadas por user story da spec.md. US3 (header/nav, P2) entra antes de US1/US2 porque é blocking visualmente — sem header mobile funcional, demais user stories não são acessíveis em mobile.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência em tarefa incompleta)
- **[Story]**: User story alvo (US1, US2, US3, US4)
- Paths absolutos quando ambíguos. Repo root: `/Users/infoprice/Documents/Projeto Sulco/sulco/`

## Path Conventions

- Código: `src/components/`, `src/app/`, `src/app/globals.css`
- Testes: `tests/{integration,e2e}/`
- Projeto Next.js single-package — sem split backend/frontend

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Garantir baseline mínimo de mobile (viewport meta, audit visual desktop pra comparação anti-regressão).

- [X] T001 Verificar/adicionar `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` em `sulco/src/app/layout.tsx` (Next 15 normalmente injeta default — confirmar e ajustar se faltando `viewport-fit=cover` que é necessário pra notch iPhone).
- [X] T002 Audit visual desktop baseline (≥1024px): tirar screenshots de cada rota autenticada principal pra comparação anti-regressão pós-009. Salvar em `specs/009-responsividade-mobile-first/screenshots-desktop-before/` (gitignored). Rotas: `/`, `/disco/[exemplo]`, `/sets`, `/sets/[exemplo]`, `/sets/[exemplo]/montar`, `/curadoria`, `/conta`, `/status`. Anotar visualmente itens chave (header layout, sidebar widths, grid columns) num arquivo `baseline-notes.md` no diretório.

**Checkpoint**: Setup pronto — viewport meta correto; baseline desktop documentado pra anti-regressão.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Primitiva `<MobileDrawer>` reutilizada por US3 (nav lateral) e US2 (filter bottom sheet). Sem ela, nenhuma das duas user stories pode começar.

**⚠️ CRITICAL**: Nenhuma US pode começar antes desta fase terminar.

- [X] T003 Criar `sulco/src/components/mobile-drawer.tsx` (client component, `'use client'`). Implementar `<MobileDrawer>` conforme contrato em `contracts/components.md`: props `{ open, onClose, side: 'left'|'right'|'bottom', ariaLabel, children, className? }`. Renderiza overlay escurecido (`bg-ink/40`) + painel com `position: fixed`, transição CSS via `translateX`/`translateY`. `role="dialog" aria-modal="true"`. Body scroll lock via `useEffect` (saving + restoring `body.style.overflow`). ESC global fecha (event listener no useEffect). Tap no overlay chama `onClose`. Foco salvo em ref ao abrir, restaurado ao fechar. **NÃO implementar drag-to-close** (research §2 explicita MVP sem gestos).
- [X] T004 [P] Teste de componente em `sulco/tests/integration/mobile-drawer-state.test.tsx` (cobre invariantes do data-model.md): renderiza `<MobileDrawer open={true} side="left" ariaLabel="Test">` + spy em `onClose`. Asserta: (a) `body.style.overflow === 'hidden'` quando `open=true`; (b) ESC dispara `onClose`; (c) tap no overlay dispara `onClose`; (d) `body.style.overflow` restaurado quando `open=false`. Pattern do 008/T018a (createRoot + act + IS_REACT_ACT_ENVIRONMENT).
- [X] T005 Criar `sulco/src/components/mobile-nav.tsx` (client component) exportando `<MobileNav>` e `<MobileNavTrigger>`. Conforme `contracts/components.md`: trigger é botão hambúrguer (≥44×44px, ícone `☰` ou SVG 3 linhas) com `useState<boolean>` local; ao clicar, abre `<MobileNav>` que renderiza `<MobileDrawer side="left" ariaLabel="Menu de navegação">` com nav vertical (Coleção / Sets / Sync / Conta) + UserButton/SignOut no rodapé. Tap em qualquer link navega via `<Link>` E chama `onClose`. Owner check via `<Show>` da Clerk pra exibir "Admin" condicional.
- [X] T006 Criar `sulco/src/components/filter-bottom-sheet.tsx` (client component). Conforme `contracts/components.md`: props `{ open, onClose, children, activeFilterCount, onApply }`. Usa `<MobileDrawer side="bottom" ariaLabel="Filtros">`. Conteúdo: topo com handle visual (linha cinza curta) + título "Filtros (N)" + botão "X" (≥44×44px); meio scrollável com `children`; rodapé sticky com botão "Aplicar (N)" full-width que chama `onApply`. Sem drag-to-close (MVP).

**Checkpoint**: Foundational pronto — primitivas de UI mobile testadas; US3/US1/US2/US4 podem ser implementadas em paralelo a partir daqui (com a ressalva de que header em US3 é visualmente blocking pras demais).

---

## Phase 3: User Story 3 — Header e nav mobile (Priority: P2 mas blocking visual) 🔓 UNLOCKER

**Goal**: Header colapsa pra ≤56px em mobile com hambúrguer; nav vai pro drawer lateral. Sem isso, header desktop atual quebra todas as outras user stories em mobile.

**Independent Test**: Em qualquer rota logada (mobile 375px), header tem ≤56px altura, logo "Sulco." visível, ícone hambúrguer tapável; tap abre drawer com 4 nav links + UserButton; tap em link navega + fecha drawer; ESC ou tap fora fecha.

**Por que vem antes de US1**: header é compartilhado em todas as rotas; sem ele responsivo, o resto fica inacessível em mobile.

- [X] T007 [US3] Refatorar Header em `sulco/src/app/layout.tsx`: mobile-first. Mobile (default): logo "Sulco." à esquerda + SyncBadge + `<MobileNavTrigger>` à direita; nav `<NavLink>` escondida (`hidden md:flex`). Desktop (`md:`): layout atual preservado integralmente. Reduzir paddings em mobile (`px-4 py-3 md:px-8 md:py-6`). UserButton e SignIn/SignUp viram itens do drawer em mobile (escondidos no header em mobile, visíveis em desktop). Manter `<Show when="signed-in">`/`<Show when="signed-out">` da Clerk. Renderizar `<MobileNav>` adjacente ao header (controlado por estado interno do `<MobileNavTrigger>`).
- [X] T008 [US3] Refatorar banners globais em `sulco/src/app/layout.tsx` pra serem responsivos: `<DiscogsCredentialBanner>`, `<ArchivedRecordsBanner>`, `<ImportPoller>`. Cada um deve quebrar em mobile sem layout horizontal. Auditar especificamente `discogs-credential-banner.tsx` e `archived-records-banner.tsx` — aplicar `flex-col md:flex-row`, padding reduzido, text size compatível, CTAs com tap target ≥44px.
- [ ] T009 [US3] Validar manualmente em viewport 375px que: (a) header tem ≤56px altura medido via DevTools; (b) hambúrguer abre drawer da esquerda; (c) drawer cobre ~75% da largura; (d) tap em "Coleção"/"Sets"/"Sync"/"Conta" navega + fecha drawer; (e) tap fora ou ESC fecha; (f) body scroll trava enquanto drawer aberto.

**Checkpoint**: US3 entregue — header e nav mobile funcionais. US1/US2/US4 podem agora ser implementadas e testadas em mobile real.

---

## Phase 4: User Story 1 — Triagem rápida na frente da estante (Priority: P1) 🎯 MVP

**Goal**: DJ no celular abre `/`, busca/filtra coleção, abre `/disco/[id]`, ouve preview Deezer (008), marca selected/rating/isBomb, retorna pra coleção. Tudo sem scroll horizontal nem zoom.

**Independent Test**: Em iPhone real (Safari) + viewport 375px, completar fluxo "abre disco → ouve A1 → marca selected → marca rating ++ → fecha → próximo disco" em ≤30s. Zero scroll horizontal. Zero zoom manual. Tap targets confortáveis.

- [X] T010 [US1] Refatorar home `/` em `sulco/src/app/page.tsx` (e/ou componentes filhos `<RecordGrid>` / `<RecordGridCard>`): grid responsivo `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (FR-011). Auditar `<RecordGridCard>` em `sulco/src/components/record-grid-card.tsx`: tamanhos de capa, tap targets ≥44px, truncate de título/artist se necessário, padding reduzido em mobile.
- [X] T011 [US1] Refatorar `<FilterBar>` em `sulco/src/components/filter-bar.tsx` pra mobile: em mobile, esconder a parede de chips e exibir botão "Filtros (N)" que abre `<FilterBottomSheet>` (T006) com o conteúdo dos filtros. Em desktop, layout atual preservado. Adicionar `<FilterActiveChips>` (T015 — pode ser feito antes ou em paralelo) acima da lista mostrando filtros aplicados. Input de busca permanece visível em ambos os breakpoints.
- [X] T012 [US1] Refatorar página `sulco/src/app/disco/[id]/page.tsx` pra mobile (FR-009): empilhamento vertical em mobile com **banner full-width** da capa (~200-240px altura, aspect-square ou aspect-[16/9] cropped) ocupando 100% da largura no topo. Abaixo: bloco de meta (artist, título, ano, selo, country, gêneros, estilos) sem grid 2 colunas — empilhado. Abaixo: `<RecordControls>` (status/shelfLocation/notes) compacto. Abaixo: botões `<EnrichRecordButton>` + `<ReimportButton>` + links Discogs/curadoria. Abaixo: tracklist agrupada por lado. Em desktop (`md:`), grid `[380px_1fr]` atual preservado.
- [X] T013 [US1] Refatorar `<TrackCurationRow>` em `sulco/src/components/track-curation-row.tsx` pra mobile (FR-010): grid mobile `grid-cols-[28px_1fr]` (vs `[36px_1fr_auto]` desktop) — coluna direita "selected/bomba" some em mobile e os controles ficam empilhados dentro do bloco principal. Tap targets ≥44px universais (toggle on/off, rating +/++/+++, bomba). Editor expansível (`<details>`) com inputs em 1 coluna em mobile (`grid-cols-1 md:grid-cols-2`). Inputs numéricos (BPM, energy) com `inputMode="numeric"` (FR-006). PreviewControls (008) preservado — testar visualmente que `flex-wrap` cabe em 375px.
- [X] T014 [US1] Aplicar `sizes` attribute em `<Image>` da capa em `sulco/src/app/disco/[id]/page.tsx` e `sulco/src/components/record-grid-card.tsx`: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"` (banner disco) e `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"` (cards coleção). Auditar `unoptimized` — se possível, remover em mobile crítico (validar que `next.config.ts` permite domínio Discogs ou aplicar `remotePatterns`). Se Vercel rejeitar otimização, manter unoptimized mas reduzir `width`/`height` apropriado.
- [X] T015 [US1] Criar `sulco/src/components/filter-active-chips.tsx` (client component, baixo). Conforme `contracts/components.md`: props `{ filters: ActiveFilter[] }` onde cada filtro tem `id`, `label`, `onRemove`. Renderiza chips horizontais scrolláveis (`flex overflow-x-auto gap-1`) com X em cada. Retorna `null` se array vazio. Reutilizado em US1 (home `/`) e US2 (`/sets/[id]/montar`).

**Checkpoint**: US1 entregue — fluxo principal de triagem funciona em mobile. MVP shipping ready (junto com US3 que é prerequisito).

---

## Phase 5: User Story 2 — Montagem de set em mobile (Priority: P2)

**Goal**: DJ em mobile abre `/sets/[id]/montar`, filtra candidatas via bottom sheet, ouve preview, adiciona à bag.

**Independent Test**: Mobile 375px, abrir `/sets/[id]/montar` de qualquer set, tap "Filtros (N)" abre bottom sheet, selecionar mood "solar", clicar "Aplicar"; lista re-renderiza; tap ▶ Deezer numa candidata toca; tap `+` adiciona à bag (preview NÃO interrompe); tap ▶ em outra candidata pausa primeira e toca segunda.

- [X] T016 [US2] Refatorar `<MontarFilters>` em `sulco/src/components/montar-filters.tsx`: em mobile, esconder o painel inline e expor o JSX dos filtros como children passáveis pra `<FilterBottomSheet>`. Em desktop, layout atual sidebar preservado. Estratégia: o componente em si fica stateless renderizando o conteúdo dos filtros; o parent decide o wrapper (sheet em mobile, sidebar em desktop) via classes responsivas (`md:block hidden` no inline + lógica condicional do sheet).
- [X] T017 [US2] Refatorar página `sulco/src/app/sets/[id]/montar/page.tsx`: em mobile, adicionar botão "Filtros (N)" no topo + `<FilterBottomSheet>` controlado por estado local (`useState<boolean>`); ao "Aplicar" no sheet, atualizar URL searchParams (mecanismo já existente) e fechar sheet. Em desktop, sidebar atual preservada. Adicionar `<FilterActiveChips>` (T015) entre o botão de filtros e a lista pra mostrar filtros aplicados. Auditar layout do `<PhysicalBag>` (lateral em desktop) — em mobile, decidir se vira drawer próprio ou seção colapsável (recomendação: seção compactada acima da lista, decisão de implementação).
- [X] T018 [US2] Refatorar `<CandidateRow>` em `sulco/src/components/candidate-row.tsx` pra mobile (FR-010 / research §8): grid atual `[48px_auto_56px_1fr_auto_auto]` em desktop preservado; em mobile, vira flex-col stack com 5-6 rows: (cover+pos+rating) / título / artist·record / badges (BPM, tom, energia) / preview controls (008) / ações (`+/✓` + remover). PreviewControls preservado. Tap targets ≥44px (`+`, `✓`, "remover", expand/collapse `▸/▾`). Detalhes expandidos continuam atrás do toggle.
- [ ] T019 [P] [US2] Validar manualmente em viewport 375px: (a) `/sets/[id]/montar` abre sem scroll horizontal; (b) botão "Filtros (3)" reflete contagem; (c) tap abre bottom sheet com handle e overlay; (d) selecionar mood, clicar "Aplicar" fecha sheet e lista atualiza; (e) chip-bar mostra filtros aplicados; (f) tap no X de um chip remove o filtro individual; (g) preview em candidata funciona sem regressão do 008.
- [X] T020 [P] [US2] Estender `<MontarFilters>` mobile com handle de gestos somente se trivial (ex: drag-to-close no bottom sheet) — DEFERIR pra futuro se exigir mais que 30 LOC. MVP fecha por: tap overlay, botão X, ou "Aplicar". Documentar decisão final em comentário no `<FilterBottomSheet>`.

**Checkpoint**: US2 entregue — montagem de set utilizável em mobile.

---

## Phase 6: User Story 4 — Curadoria sequencial em mobile (Priority: P3)

**Goal**: `/curadoria` (006) funciona em mobile com 1 disco por tela e botões grandes ✓/✗/⏭.

**Independent Test**: Mobile 375px, abrir `/curadoria`, fazer 5 disco-a-disco com tap nos botões active/discarded/pular; cada transição imediata, sem lag visível.

- [X] T021 [US4] Refatorar `sulco/src/app/curadoria/page.tsx` (e/ou componente client correspondente, ex: `<CuradoriaView>` em `src/components/curadoria-view.tsx`): em mobile, layout vertical com capa centralizada full-width (~280-320px), metadados compactos abaixo, e 3 botões grandes (`✓ ativo`, `✗ descartar`, `⏭ pular`) ocupando largura total empilhados ou em row de 3 colunas iguais. Tap targets ≥56px altura (mais generoso pq são as primárias). Em desktop, layout atual preservado.
- [ ] T022 [US4] Validar manualmente em viewport 375px: tap em ✓/✗/⏭ avança pro próximo disco sem flicker; sem scroll horizontal; transições fluidas.

**Checkpoint**: US4 entregue — fluxo de triagem sequencial mobile-friendly.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Anti-regressão desktop, e2e mobile, validação manual em devices reais, deploy validation.

- [X] T023 [P] Criar e2e mobile em `sulco/tests/e2e/mobile-curadoria-fluxo.spec.ts`. Playwright em viewport 375x667 cobrindo US1: login (skip se pipeline auth não está no CI — usar `describe.skip` no padrão dos demais e2e), navegar pra disco, abrir tracklist, tap em ▶ Deezer, tap em toggle on/off, tap em rating ++, voltar pra coleção. Asserts: zero scroll horizontal (`document.documentElement.scrollWidth <= window.innerWidth`); estados visuais corretos.
- [X] T024 [P] Atualizar `sulco/README.md` adicionando seção breve "Responsividade mobile (009)" com decisões UX (drawer lateral pra nav, banner full-width em /disco, bottom sheet pra filtros), breakpoints (≤640px mobile, 641-1023px tablet, ≥1024px desktop), e nota explícita "PWA não é parte do 009; vira Inc 2b futuro". Link pra spec 009.
- [ ] T025 Audit visual desktop pós-009 (≥1024px): tirar screenshots das mesmas rotas do T002 e comparar manualmente com `screenshots-desktop-before/`. Anotar qualquer divergência > 5% em `baseline-notes.md`. Esperado: zero regressão (SC-004).
- [X] T026 Rodar `npx tsc --noEmit` no repo e `npm test`. Validar zero erros e zero regressões. Tests novos (T004 mobile-drawer-state) devem passar verde.
- [ ] T027 Validação manual quickstart §1-6 em iPhone real (Safari) E Android real (Chrome) — SC-005 obrigatório. Anotar qualquer divergência por dispositivo. Especialmente checar: body scroll lock em iOS, teclado virtual não esconde inputs, capas Discogs carregam em <3s em 4G.
- [X] T028 Atualizar `sulco/BACKLOG.md` movendo Incremento 2 (PWA / mobile) da seção "Não-priorizados" pra "Próximos" como **Inc 2b — PWA** (manifest + service worker + install + offline), citando 009 como prerequisito entregue. Mover Inc 8 (Refatoração UX dos filtros multi-facet) pra "Histórico" se 009 cobriu o suficiente, OU manter aberto pra refinamento desktop. Adicionar 009 em "Releases (entregues, em prod)".

---

## Dependency Graph

```
Phase 1 (Setup: T001-T002)
  └─→ Phase 2 (Foundational: T003-T006)
        └─→ Phase 3 (US3: T007-T009) ──┬─→ Phase 4 (US1: T010-T015) ──┐
                                        ├─→ Phase 5 (US2: T016-T020) ─┤
                                        └─→ Phase 6 (US4: T021-T022) ─┴─→ Phase 7 (Polish: T023-T028)
```

**Story dependencies**:
- US3 (header/nav) é blocking pras demais — sem ele, nenhuma rota é navegável em mobile.
- US1, US2, US4 são paralelizáveis depois de US3 (arquivos diferentes).
- Polish depende de TODAS as stories prontas.

**Foundational dependencies**:
- T003 (`<MobileDrawer>`) bloqueia T005 (`<MobileNav>` usa drawer) e T006 (`<FilterBottomSheet>` usa drawer).
- T005 (`<MobileNav>`) bloqueia T007 (Header refactor monta `<MobileNavTrigger>` + `<MobileNav>`).
- T006 (`<FilterBottomSheet>`) bloqueia T011 (FilterBar mobile) e T017 (Montar mobile).

---

## Parallel Execution Examples

**Foundational (Phase 2)** — após T003 (MobileDrawer): T005 e T006 podem rodar em paralelo (componentes diferentes que ambos consomem MobileDrawer).

**US1 (Phase 4)** — após T012 (page) e T013 (TrackCurationRow): T014 (sizes em Image) e T015 (FilterActiveChips) são paralelos. Visual validation de T015 depende de T011.

**US2 (Phase 5)** — T018 (CandidateRow refactor) é independente de T016/T017 (montar page + filters); pode rodar em paralelo. T019 e T020 são validações/extensões opcionais — paralelizáveis no fim.

**Polish (Phase 7)** — T023 (e2e) + T024 (README) são paralelos. T025 (visual diff) depende das fases 4-6 prontas. T026 (typecheck/tests) deve rodar depois de tudo. T027 (mobile real) e T028 (BACKLOG) podem ser paralelos.

---

## Implementation Strategy

**MVP mínimo recomendado**: Phases 1 + 2 + 3 (US3) + 4 (US1). Entrega o fluxo "DJ na frente da estante" — caso de uso primário. US2/US4 podem vir em deploys seguintes sem bloquear.

**Deliverables incrementais possíveis**:

1. **v0.5 (interno)**: Phase 1+2 — MobileDrawer testado, MobileNav e FilterBottomSheet criados sem integração. Não shippa.
2. **v1.0 (MVP shipping)**: + Phase 3 (US3) + Phase 4 (US1). Header mobile + home + `/disco/[id]` funcionais. Triagem na estante já dá pra usar.
3. **v1.1**: + Phase 5 (US2). Montagem mobile.
4. **v1.2**: + Phase 6 (US4). Curadoria sequencial mobile.
5. **release final**: + Phase 7. Quickstart validado em iOS+Android real, BACKLOG atualizado, lint/typecheck/tests verdes, anti-regressão desktop confirmada.

**Anti-goals explícitos (não fazer neste round)**:

- PWA (manifest, service worker, install, offline) — Inc 2b futuro
- Native apps (React Native, Capacitor)
- Gestos avançados (swipe, pull-to-refresh, drag-to-close real)
- Modo escuro / dark mode
- Performance budget agressivo (Lighthouse ≥95) — foco é UX funcional
- Refatoração radical do filtros multi-facet desktop (Inc 8 segue separado)

---

## Test Summary

| Teste | Fase | Cobre |
|---|---|---|
| `mobile-drawer-state.test.tsx` (T004) | 2 | MobileDrawer: open/closed, body scroll lock, ESC fecha, overlay fecha |
| `mobile-curadoria-fluxo.spec.ts` (T023) | 7 | US1 fluxo e2e em viewport 375x667 (skip enquanto pipeline auth não pronta) |
| Visual diff desktop manual (T002 → T025) | 1, 7 | SC-004 zero regressão visual desktop ≥1024px |
| Quickstart manual iPhone+Android (T027) | 7 | SC-005 funcionando em devices reais |

---

**Total**: 28 tasks · 2 Setup + 4 Foundational + 3 US3 + 6 US1 + 5 US2 + 2 US4 + 6 Polish

**Estimativa de esforço** (com IA pair): ~3-4 dias de dev focado. `<MobileDrawer>` (T003) + Header mobile (T007) são os trechos mais densos — cada ~2-3h. Refactor de `<TrackCurationRow>` e `<CandidateRow>` exigem cuidado pra não quebrar desktop (~3-4h cada).
