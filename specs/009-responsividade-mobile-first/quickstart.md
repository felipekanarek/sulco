# Quickstart — Validação manual do 009

Validação visual e funcional pós-deploy. Complementa testes
automatizados.

## Pré-requisitos

- Branch `009-responsividade-mobile-first` deployada (preview
  Vercel) ou `npm run dev` rodando local
- iPhone real (Safari) E Android real (Chrome) — SC-005 exige ambos
- Acervo com discos enriquecidos pelo 005 e com previews 008
- Rede 4G ou WiFi estável

## Caminho golden — US1 (triagem na estante)

### 1. Login e navegação inicial

Abrir `https://sulco.vercel.app` (ou `http://localhost:3000` via
ngrok/zrok pra mobile real):

- [ ] Logado, vejo a home `/` em mobile (viewport 375-414px) sem
  scroll horizontal
- [ ] Header tem ≤56px altura, com logo "Sulco." + ícone hambúrguer
  + UserButton/SyncBadge
- [ ] Tap no hambúrguer abre drawer da esquerda em ≤300ms
- [ ] Drawer mostra: Coleção · Sets · Sync · Conta
- [ ] Tap fora do drawer (overlay escurecido) fecha
- [ ] Drawer fechado, body scroll volta ao normal
- [ ] Tap em "Coleção" navega + fecha drawer
- [ ] Botão de voltar do navegador também fecha o drawer (não
  navega) — opcional, validar se foi implementado

### 2. Coleção em mobile

Na home `/`:

- [ ] Cards de disco aparecem em **1 coluna** (viewport 375px) ou
  **2 colunas** (viewport 640-1023px)
- [ ] Capa de cada card tem tamanho proporcional, sem distorção
- [ ] Busca/input visível no topo, full-width
- [ ] Botão "Filtros (N)" visível (substitui parede de chips)
- [ ] Tap em "Filtros" abre **bottom sheet**:
  - sheet sobe do rodapé com handle visível no topo
  - cobre ~80% da altura
  - botão "X" no canto superior direito
  - botão "Aplicar (N)" sticky no rodapé
- [ ] Selecionar 1 gênero + 1 estilo no sheet, clicar "Aplicar"
  - sheet fecha
  - chip-bar aparece acima da lista mostrando filtros ativos
  - lista atualiza
- [ ] Tap no X de um chip remove o filtro individual sem reabrir
  sheet
- [ ] Tap em "Filtros" novamente abre sheet com estado anterior
  preservado

### 3. Disco específico — `/disco/[id]`

Tap num card de disco:

- [ ] **Banner full-width** no topo (~200-240px altura), capa
  preenchendo a largura como hero
- [ ] Abaixo: artist + título + ano + selo + status, sem grid 2
  colunas (empilhado)
- [ ] Controles do disco (status, shelfLocation, notes, reimport,
  link Discogs) visíveis em sequência
- [ ] Tracklist agrupada por lado (A, B, C...)
- [ ] Cada faixa visível com:
  - posição (A1, A2...)
  - título (font-serif italic)
  - duration (font-mono compacto)
  - 3 botões de preview: ▶ Deezer · ↗ Spotify · ↗ YouTube
  - rating (+, ++, +++) — tap em `++` muda visual
  - toggle on/off
  - bomba (toggle)
- [ ] Toda área tapável tem ≥44×44px (testar com dedo, sem zoom)
- [ ] Tap em ▶ Deezer toca preview em ≤3s (008 cache miss) ou
  <500ms (cache hit)
- [ ] Tap em "editar curadoria" expande editor inline:
  - inputs BPM/energy abrem teclado **numérico** (não querty)
  - moods/contexts aparecem como chips selecionáveis
  - comment textarea funciona com teclado virtual aberto
  - layout não quebra com teclado aberto (textarea visível)

### 4. Montagem de set — `/sets/[id]/montar`

Voltar pra `/sets`, escolher um set, clicar "montar":

- [ ] Lista de candidatas aparece em 1 coluna
- [ ] Cada `<CandidateRow>` mobile:
  - cover (~40-48px) + posição + rating
  - título + artist (linha clamp)
  - badges: BPM, tom, energia
  - 3 botões de preview (008)
  - botão `+` ou `✓` (se na bag)
- [ ] Botão "Filtros (N)" visível
- [ ] Bottom sheet de filtros funciona igual home (BPM range, moods
  AND, contexts AND, etc.)
- [ ] Tap em ▶ Deezer numa candidata toca; tap em outra ▶ pausa a
  primeira e toca a nova
- [ ] Tap em `+` adiciona à bag; preview NÃO interrompe (FR-007 do 008)
- [ ] Visualizar bag física (lateral em desktop, drawer/section em
  mobile?) — verificar comportamento implementado

### 5. Curadoria sequencial — `/curadoria`

Abrir `/curadoria` (recomendar via menu "Coleção" → algum link):

- [ ] 1 disco por vez ocupando a tela
- [ ] Capa centralizada
- [ ] Botões grandes ✓ active / ✗ discarded / ⏭ pular
- [ ] Tap em ✓ ou ✗ avança pro próximo sem flicker

### 6. Anti-regressão desktop

Abrir `https://sulco.vercel.app` em desktop (≥1024px width):

- [ ] Layout idêntico ao pré-009 (visual diff manual)
- [ ] Header completo com nav inline (Coleção · Sets · Sync)
- [ ] `/disco/[id]` com sidebar 380px à esquerda + tracklist à
  direita
- [ ] `/sets/[id]/montar` com sidebar de filtros à esquerda +
  candidatas à direita
- [ ] Cards de coleção em 4 colunas
- [ ] Zero alteração visível de fonte, cor, espaçamento

## Cenários de falha

### Drawer aberto + back button do navegador

**Comportamento esperado**: back fecha o drawer (não navega).

**Validação**:
- [ ] Abrir drawer
- [ ] Apertar back do browser (Android) ou swipe-back (iOS)
- [ ] Drawer fecha; URL não muda

Se não funcionar (MVP pode pular): bug não-crítico, registrar pra
fix futuro.

### Body scroll lock em iOS Safari

**Cenário**: drawer/sheet aberto, tentar scrollar atrás do overlay.

**Esperado**: scroll do body trava; só o conteúdo do drawer/sheet
scrolla.

**Validação**:
- [ ] iOS Safari: drawer aberto, deslizar dedo no overlay
  - se body NÃO scrolla → ok
  - se body scrolla → bug (aplicar fallback `position: fixed`)

### Imagens grandes em 4G

**Cenário**: rede móvel real, viewport mobile.

**Esperado**: capa Discogs carrega em ≤3s; sem layout shift.

**Validação**:
- [ ] DevTools Network: tamanho da imagem servida em mobile
  - se > 200KB e viewport <640px → revisar `sizes` attribute
- [ ] LCP em rotas chave: `/`, `/disco/[id]` ≤ 2.5s em 4G real

## Métricas a observar

- **SC-001** (≤30s no fluxo US1): cronometrar 5 discos diferentes;
  média ≤30s do tap "abrir disco" até "voltar pra coleção" com
  todas as ações (preview + selected + rating).
- **SC-002** (zero scroll horizontal em ≥10 rotas): verificar:
  `/`, `/disco/[id]`, `/sets`, `/sets/[id]`, `/sets/[id]/montar`,
  `/curadoria`, `/conta`, `/status`, `/onboarding`, `/admin/convites`
  (se owner). Em viewport 375px e 414px.
- **SC-003** (tap targets ≥44px): DevTools mobile inspector — checar
  pelo menos 5 botões primários (toggle on/off, rating, ▶ Deezer,
  +/✓ adicionar, hambúrguer).
- **SC-005** (iOS Safari + Android Chrome): screenshots de cada
  rota em ambos os ecossistemas; sem bugs visuais grosseiros.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Drawer não abre ao tap | Estado não está conectado | Verificar `useState` no Header |
| Drawer abre mas não fecha (ESC ou tap fora) | Event listener faltando | Verificar `useEffect` em `<MobileDrawer>` |
| Body scrolla atrás do drawer aberto (iOS) | Bug iOS — `overflow:hidden` insuficiente | Aplicar fallback `position:fixed` + restaurar scrollY |
| Filter sheet "Aplicar" não atualiza lista | Draft state não promove pra URL | Verificar `onApply` callback no parent |
| Cards quebram em viewport 320px (iPhone SE 1) | Layout muito apertado | Adicionar fallback `min-w-0` + `truncate`; ou aceitar wrap |
| Preview Deezer (008) não toca em mobile | Audio bloqueado por autoplay policy | Já tratado em 008 (`<audio>` instanciado em handler de tap) |
| Teclado virtual esconde input | Layout sem `min-h-screen` ou viewport-fit | Adicionar `viewport-fit=cover` no meta tag (já existe?) |
| Imagem cover gigante em mobile | `sizes` faltando no `<Image>` | Aplicar `sizes="(max-width: 640px) 100vw, ..."` |
| Hover state visível em desktop sumiu em mobile | `hover:` sem equivalente `active:` | Adicionar `active:` ou aceitar visual quieto |
