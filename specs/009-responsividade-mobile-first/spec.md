# Feature Specification: Responsividade mobile-first do Sulco

**Feature Branch**: `009-responsividade-mobile-first`
**Created**: 2026-04-26
**Status**: Draft
**Input**: DJ usa o app no celular **na frente da estante de vinil**
pra triagem rápida — selecionar/descartar disco, marcar isBomb, dar
rating, ouvir preview Deezer (008). Hoje o layout só funciona bem em
desktop (≥1024px); em mobile vira parede de chips e grids quebrados.
Escopo desta entrega: layout responsivo até viewport 360-640px, com UX
adaptada pro fluxo "vinil na mão". **NÃO é PWA** (sem service worker,
sem manifest, sem offline) — isso fica como Inc futuro 2b.

## Clarifications

### Session 2026-04-26

- Q: Padrão de navegação mobile (FR-007)? → A: Drawer lateral
  (slide da esquerda, ~75% da largura), acionado por ícone hambúrguer
  no topo direito; nav vertical com Coleção/Sets/Sync/Conta + UserButton
  no rodapé.
- Q: Apresentação da capa em `/disco/[id]` mobile (FR-009)?
  → A: Banner full-width no topo (~200-240px altura), capa preenchendo
  largura como hero. Meta (artist, título, ano, selo, status, controles)
  abaixo do banner. Tracklist começa após meta + controles.
- Q: Tipo de drawer pros filtros multi-facet em mobile (FR-008)?
  → A: Bottom sheet (sobe do rodapé), cobrindo ~80% da altura, com
  handle no topo pra drag-to-close, conteúdo scrollável, botão
  "Aplicar" sticky no rodapé. Diferenciado do drawer de nav (Q1) que
  vem da esquerda.

## User Scenarios & Testing

### User Story 1 — Triagem rápida na frente da estante (Priority: P1)

DJ está na sala de discoteca, vinil na mão, celular no bolso. Pega o
disco da estante, abre o Sulco no celular, busca pelo título ou artista
na coleção, abre o disco, ouve 30s de cada faixa via Deezer, marca o
que vai usar (toggle on/off), opcionalmente atribui rating ou marca
isBomb, e devolve o disco pra estante. Próximo disco. Tudo num fluxo
de ≤30s por disco.

**Why this priority**: caso de uso primário. DJ não cura discos
sentado na frente do PC — cura na frente da estante. Sem mobile bom,
todo o trabalho de curadoria fica travado pra horários em casa.

**Independent Test**: abrir https://sulco.vercel.app no Safari iOS
ou Chrome Android (viewport 375-414px), navegar até `/disco/[id]`,
fazer toggle de selected + rating + isBomb + tocar preview Deezer
sem precisar de zoom horizontal nem scroll lateral.

**Acceptance Scenarios**:

1. **Given** DJ no celular (viewport 375px), **When** abre `/disco/[id]`,
   **Then** vê capa, metadados (artista/título/ano/selo) e tracklist
   sem scroll horizontal; cada faixa cabe na tela com posição, título,
   3 botões de preview (▶ Deezer / ↗ Spotify / ↗ YouTube) e o toggle
   `on/off` visíveis sem precisar expandir.
2. **Given** mesma tela, **When** DJ tap no toggle `on/off` da faixa,
   **Then** ação salva imediatamente (Server Action 003), botão muda
   visual sem navegação. Mesmo pra rating (+, ++, +++) e isBomb.
3. **Given** mesma tela, **When** DJ tap no `▶ Deezer`, **Then**
   preview toca em ≤3s (cache miss) ou <500ms (cache hit, 008); botão
   vira `⏸`; toda a UI continua interativa enquanto toca.
4. **Given** DJ está na home `/` em mobile, **When** rola a coleção,
   **Then** cards de disco aparecem 1-2 colunas (não 4-6 como
   desktop); busca por título/artista visível na header sem expandir
   menu.
5. **Given** DJ está em qualquer tela, **When** o teclado virtual
   abre pra digitar busca/comentário, **Then** layout NÃO quebra
   nem esconde o input atrás do teclado.
6. **Given** dispositivo orientado em **landscape**, **When** DJ
   roda o celular, **Then** layout reflua sem quebra; faixas
   continuam tapáveis; preview controls visíveis.

---

### User Story 2 — Montagem de set em mobile (Priority: P2)

DJ no metrô ou esperando alguém, abre `/sets/[id]/montar` no celular,
filtra candidatas por mood/contexto/BPM, ouve preview, adiciona à
bag.

**Why this priority**: secundário ao US1 (triagem é o uso real
diário). Montagem normalmente é feita em casa no PC, mas ter mobile
funcional desbloqueia "ajustar set entre compromissos".

**Independent Test**: abrir `/sets/[id]/montar` no celular, aplicar
filtro de mood (ex: "solar"), tocar preview de candidata, clicar `+`
pra adicionar à bag, ver bag atualizar; tudo sem scroll horizontal e
sem o painel de filtros tomar a tela toda permanentemente.

**Acceptance Scenarios**:

1. **Given** DJ em mobile (viewport 375px), **When** abre
   `/sets/[id]/montar`, **Then** lista de candidatas aparece em 1
   coluna, cada `<CandidateRow>` com cover (40-48px), título, badges
   essenciais (BPM, tom, energia), preview controls, e botão `+/✓`.
2. **Given** painel de filtros multi-facet (gênero, estilo, moods,
   contexts) que em desktop tomam ~30% da largura, **When** mobile,
   **Then** filtros viram **drawer/bottom sheet** acionável por
   botão "Filtros (N)" no topo; ao abrir, sobrepõe a lista; ao
   fechar, volta pra lista com filtros aplicados visíveis num
   chip-bar compacto.
3. **Given** drawer de filtros aberto, **When** DJ seleciona moods e
   fecha, **Then** filtros aplicam e lista re-renderiza; ao reabrir,
   estado persiste (não re-zera).
4. **Given** lista de candidatas, **When** DJ tap em `+`, **Then**
   faixa entra na bag; feedback visual (badge ✓) sem navegar.

---

### User Story 3 — Header e nav mobile (Priority: P2)

DJ navega entre Coleção / Sets / Sync sem que header tome 1/3 da
tela.

**Why this priority**: navegação é compartilhada entre todas as
telas; ergonomia mobile. Sem isso, todas as US1/US2 sofrem.

**Independent Test**: em qualquer rota, header é compacto (≤56px
altura) e os links de nav (Coleção, Sets, Sync) cabem horizontalmente
ou viram menu hamburger; UserButton e SyncBadge presentes mas sem
quebrar.

**Acceptance Scenarios**:

1. **Given** mobile (viewport 375px), **When** abro qualquer rota
   logado, **Then** header tem ≤56px altura; logo "Sulco." à
   esquerda, ícone de menu/conta à direita, com nav escondida atrás
   de hamburger OU compactada (decisão de design).
2. **Given** mobile, **When** abro o menu hamburger, **Then** vejo
   Coleção / Sets / Sync / Conta como links empilhados, com tap
   targets ≥48px altura.
3. **Given** banners globais (DiscogsCredentialBanner,
   ArchivedRecordsBanner, ImportProgress) em mobile, **When**
   aparecem, **Then** ocupam largura full mas têm botão de fechar/dismiss
   acessível; não empurram a tela inteira pra baixo de forma
   permanente.

---

### User Story 4 — Curadoria sequencial em mobile (Priority: P3)

DJ usa `/curadoria` (triagem sequencial random/ordered) no celular —
disco-a-disco, sem voltar pra coleção entre eles.

**Why this priority**: já existe (006), mas precisa funcionar bem em
mobile. P3 porque o fluxo "estante" do US1 cobre a maior parte do
caso real; `/curadoria` é mais "sentar e processar 50 discos pendentes"
que normalmente é feito em casa.

**Independent Test**: abrir `/curadoria` no celular, fazer 3-5
disco-a-disco (active/discarded), navegar com swipe ou botões grandes
"próximo / anterior".

**Acceptance Scenarios**:

1. **Given** DJ em `/curadoria` mobile, **When** abre, **Then** vê
   1 disco por vez ocupando a tela toda (capa central, metadados,
   3 botões de ação: ✓ active, ✗ discarded, ⏭ pular).
2. **Given** mesma tela, **When** clica em `✓` ou `✗`, **Then**
   próximo disco aparece sem navegação aparente.

---

### Edge Cases

- **Viewport < 360px** (iPhone SE 1ª gen, Android pequenos):
  fallback gracioso — texto pode quebrar em 2 linhas mas tudo
  continua tapável e legível.
- **Viewport > 1024px após responsivo** (desktop): layout antigo
  preservado integralmente. Sem regressão visual.
- **Viewport intermediário 641-1023px** (tablet portrait):
  comportamento híbrido — pode usar layout desktop com paddings
  reduzidos, ou mobile com colunas duplas (decidir caso a caso por
  tela).
- **Touch targets pequenos**: botões antigos com `text-[10px]` em
  desktop precisam crescer pra mobile (mínimo 44x44px alvo Apple HIG
  / 48x48dp Google Material).
- **Hover states**: em mobile não existem; estados `hover:` precisam
  ter equivalente `active:` ou ser aceitáveis sem feedback de hover.
- **Imagens não-otimizadas**: covers Discogs em 600x600 baixadas
  full em mobile estouram banda 4G — aplicar tamanhos responsivos
  via `<Image>` Next.
- **Drawer de filtros aberto + back button do navegador**: voltar
  deve fechar drawer, não navegar pra rota anterior (boa prática
  mobile).
- **Modal/drawer + scroll background**: travar scroll do `<body>`
  quando drawer aberto pra evitar dupla rolagem.
- **Long press / context menu nativo**: ao tocar no preview Deezer
  ▶, navegador iOS pode disparar menu de "Salvar áudio" — desabilitar
  via `-webkit-touch-callout: none`.
- **Inputs numéricos (BPM, energy)**: usar `inputMode="numeric"` pra
  abrir teclado numérico nativo em mobile.

## Requirements

### Functional Requirements

**Layout & viewport**

- **FR-001**: Sistema MUST renderizar todas as telas autenticadas
  (`/`, `/disco/[id]`, `/sets/[id]/montar`, `/curadoria`, `/sets`,
  `/conta`, `/status`) sem **scroll horizontal** em viewports
  360-640px (limite mobile padrão).
- **FR-002**: Sistema MUST manter layout desktop atual (≥1024px) **sem
  regressão visual ou funcional**. Inc 009 é aditivo — não reescreve.
- **FR-003**: Sistema MUST adaptar grids e flex containers via
  breakpoints responsivos (sm/md/lg do tema atual). Mobile-first:
  default = mobile, prefixos `md:`/`lg:` adicionam comportamento
  desktop.

**Touch targets & ergonomia**

- **FR-004**: Todos os botões interativos primários (toggle on/off,
  rating, isBomb, preview play, +/✓ adicionar) MUST ter área de
  toque mínima de **44×44px** em mobile (Apple HIG / Material
  guidelines).
- **FR-005**: Sistema MUST evitar dependência de hover-only feedback.
  Estados visuais MUST ter equivalente em `active:` ou ser
  redundantes (ex: cor + texto + ícone).
- **FR-006**: Inputs numéricos (BPM, energy, rating) MUST usar
  `inputMode="numeric"` ou `type="tel"` pra abrir teclado numérico
  nativo em mobile.

**Header & navegação**

- **FR-007**: Em mobile (≤768px), header MUST ter altura ≤56px e
  conter: logo "Sulco." à esquerda (sempre visível), ícone hambúrguer
  à direita (≥44×44px) que abre **drawer lateral**, e SyncBadge
  inline quando aplicável. Os links de nav (Coleção, Sets, Sync) NÃO
  aparecem no header — ficam dentro do drawer.
- **FR-007a**: Drawer lateral MUST deslizar da esquerda cobrindo
  ~75% da largura da viewport, com fundo escurecido (overlay) na
  parte direita. Conteúdo do drawer: nav vertical empilhada
  (Coleção / Sets / Sync / Conta), com tap targets ≥48px altura;
  UserButton + sign-out no rodapé do drawer. MUST ser fechável por
  tap no overlay, botão "X" no canto superior direito do drawer,
  ou tap em qualquer link de nav (que então navega).

**Filtros multi-facet (`/sets/[id]/montar` e home `/`)**

- **FR-008**: Em mobile, filtros multi-facet (gênero, estilo, moods,
  contexts, BPM range, etc) MUST ser apresentados em **bottom sheet**
  (sobe do rodapé) acionável por botão "Filtros (N)" — onde N é a
  contagem de filtros ativos.
- **FR-008a**: Bottom sheet de filtros MUST cobrir ~80% da altura
  da viewport, ter topo arredondado com handle (drag indicator) pra
  fechar, conteúdo scrollável internamente, e botão "Aplicar" sticky
  no rodapé do sheet. MUST ser fechável por tap fora (overlay
  escurecido), drag pra baixo no handle, ou botão "Aplicar".
- **FR-008b**: Ao fechar com filtros aplicados, mobile MUST mostrar
  **chip bar compacto** acima da lista mostrando filtros ativos com
  X individual pra remover (sem reabrir drawer).
- **FR-008c**: Estado de filtros MUST persistir entre aberturas do
  drawer (não zerar a cada abertura).

**Curadoria de disco (`/disco/[id]`)**

- **FR-009**: Em mobile, layout de `/disco/[id]` MUST empilhar
  verticalmente: **(1) banner full-width** no topo com a capa
  ocupando 100% da largura da viewport (altura ~200-240px, aspecto
  quadrado pode ser cropado em landscape se necessário); **(2) bloco
  de metadados** logo abaixo (artista, título, ano, selo, país,
  status atual, gêneros/estilos) compacto sem grid em duas colunas;
  **(3) controles do disco** (status, shelfLocation, notes, botão de
  reimport, link Discogs); **(4) tracklist** completa, agrupada por
  lado, ocupando o restante da tela.
- **FR-010**: `<TrackCurationRow>` MUST funcionar em mobile com
  toggle on/off, rating (+/++/+++), preview controls (008) e isBomb
  visíveis sem expandir o "editor". Editor expansível continua
  funcional.

**Coleção (`/`)**

- **FR-011**: Cards de disco MUST aparecer em **1 coluna** em
  ≤480px, **2 colunas** em 481-768px, **mantém atual** em ≥769px.
- **FR-012**: Busca/filtro de coleção MUST estar acessível em mobile
  via campo no topo da página ou botão de filtro (não esconder
  atrás de menu profundo).

**Imagens**

- **FR-013**: Sistema MUST servir capas em tamanhos responsivos
  (`sizes` attribute do Next `<Image>`) — covers grandes só em
  desktop, thumbs reduzidos em mobile.

**Banners globais**

- **FR-014**: Banners (DiscogsCredentialBanner,
  ArchivedRecordsBanner, ImportProgress) MUST funcionar em mobile
  sem quebrar layout. Texto longo MUST quebrar em ≥2 linhas; CTAs
  MUST manter área de toque mínima.

**Acessibilidade**

- **FR-015**: Todas as interações novas MUST manter labels ARIA e
  contraste de cor existentes. Drawer de filtros MUST ter
  `role="dialog"` + foco gerenciado.

### Key Entities

Sem novos entities. **Inc 009 é puramente front-end** — zero schema
delta, zero novas Server Actions. Reutiliza tudo dos incrementos
001-008.

## Success Criteria

### Measurable Outcomes

- **SC-001**: DJ consegue completar fluxo "abre disco → ouve 1 faixa
  → marca selected → fecha" em mobile (375px viewport) em ≤30s,
  sem zoom manual, sem scroll horizontal, sem precisar virar pro
  desktop.
- **SC-002**: 100% das rotas autenticadas existentes (≥10 rotas)
  rendem sem scroll horizontal em viewports 375px e 414px (iPhone
  SE 2/3, iPhone Pro). Validado por screenshot manual em todas as
  rotas listadas.
- **SC-003**: Tap targets de todos os botões interativos primários
  têm largura E altura ≥44px (medido via DevTools mobile inspector).
  Cobertura: 100% das ações que DJ faz no fluxo US1.
- **SC-004**: Zero regressão visual em desktop (≥1024px) — diff
  visual screenshot-by-screenshot mostra mudança < 5% em rotas
  existentes (tolerância pra ajustes de padding/grid).
- **SC-005**: Layout funciona em **dispositivos reais testados**:
  iPhone (Safari), Android (Chrome). Mínimo 1 dispositivo de cada
  ecossistema validado manualmente antes do ship.

## Assumptions

- DJ usa Safari iOS ou Chrome Android (≥95% do mercado mobile
  brasileiro 2026). IE/Firefox mobile fora de escopo.
- Conexão 4G/WiFi disponível — sem otimização agressiva pra 2G nem
  modo offline (PWA é Inc futuro).
- Tailwind v3 atual já suporta os breakpoints mobile-first (sm/md/lg/xl)
  — incremento usa primitivas existentes, não muda o tema.
- Identidade editorial preservada: tipografia EB Garamond + JetBrains
  Mono, paleta atual, mesmo acento `#a4332a`. Mobile herda toda a
  estética do prototype baseline.
- Componentes do 008 (`<PreviewControls>`) já são responsivos por
  natureza (flex-wrap) — confirmar visualmente, ajustar se quebrar.
- Sem dependência de bibliotecas novas — drawer/sheet implementado
  via CSS + `useState` (constituição proíbe shadcn etc).
- DJ não tem expectativa de "app nativo" nesta entrega — UX mobile
  web é aceitável como ponte até PWA virar.

## Dependencies

- **Identidade editorial preservada** (`../sulco-legacy-backup/`):
  consultar antes de qualquer mudança visual significativa, conforme
  feedback `feedback_ui_prototype_baseline`.
- **Preview de áudio (008)**: `<PreviewControls>` é compartilhado em
  US1 e US2; já implementado, deve funcionar em mobile com ajustes
  mínimos.
- **Tailwind v3 + breakpoints** existentes (sm: 640px, md: 768px,
  lg: 1024px, xl: 1280px).
- **Chip / ChipPicker / FilterBar / MontarFilters** atuais —
  refatorar pra responsivo, não reescrever do zero.

## Fora de escopo (neste incremento)

- **PWA** (Inc 2 / 2b): manifest, service worker, instalação "Add
  to Home Screen", offline básico, splash screen. Vira Inc seguinte
  separado, com pré-requisito do 009 pronto.
- **Native apps** (iOS/Android via React Native, Capacitor, etc.):
  fora do roadmap.
- **Gestos avançados** (swipe entre faixas, pull-to-refresh): podem
  vir como melhoria futura. Inc 009 se contenta com tap padrão.
- **Performance budget agressivo** (Lighthouse ≥95 mobile): nice
  to have, não é gating. Foco é UX funcional, não otimização extrema.
- **Modo escuro / dark mode**: independente, fora do escopo.
- **Refatoração radical do filtros multi-facet** (Inc 8 do BACKLOG):
  Inc 009 entrega o drawer/sheet mobile como solução pragmática.
  Inc 8 (combobox/popover desktop) continua separado — uma coisa
  não impede a outra.

## Notas de implementação (referência pra `/speckit.plan`)

Não-normativo. Decisões prováveis surgidas no briefing:

- **Estratégia mobile-first**: Tailwind classes default = mobile,
  prefixos `md:`/`lg:` adicionam comportamento desktop. Maioria dos
  componentes hoje faz o oposto (default desktop, sem prefixo) —
  inverter exige cuidado pra não quebrar.
- **Drawer/bottom sheet implementação**: client component novo
  `<MobileDrawer>` com `position: fixed`, `bottom: 0`, transform:
  translateY pra animar. Lock body scroll quando aberto.
- **Header mobile**: hamburger via componente novo `<MobileNav>` ou
  refactor do `<Header>` existente em layout.tsx.
- **Audit visual**: rodar Chrome DevTools mobile emulation (iPhone
  SE 375px, iPhone 14 390px, Pixel 7 412px) em todas as rotas
  autenticadas antes de declarar "pronto".
- **Reuso PreviewControls 008**: já tem `flex-wrap` — testar em
  375px e ajustar gap/wrap se necessário.
- **Performance**: capas Discogs hoje são 600px unoptimized. Em
  mobile, servir 200-300px via `sizes="(max-width: 640px) 200px, 600px"`.
- **Test strategy**: e2e Playwright em modo mobile (`viewport: { width: 375, height: 667 }`)
  para US1 fluxo principal. Visual diff em desktop pra anti-regressão.
