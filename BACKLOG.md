# Backlog — Sulco

**Última atualização**: 2026-05-01 (Bug 16 incluído no pacote 022 — fix poller + cache getImportProgress)

Convenção:
- **IDs preservam histórico** (Incremento N, Bug N) — não renumerar quando algo é fechado.
- Status: 🟢 priorizado · 🟡 médio · ⚪ não-priorizado · ✅ entregue · 🔒 fechado sem código

---

## Roadmap

### 🟢 Próximos (semanas)

#### Incremento 29 — UX rework dos filtros do montar set

Mantenedor sinalizou durante implementação do Inc 28 (sessão
2026-05-02) que os filtros do `/sets/[id]/montar` "não estão
legais". Pacote dedicado a melhorar a usabilidade da fileira de
filtros (BPM/energy/rating ranges, Camelot wheel, ChipPicker
moods/contexts, bomba tri-state, texto livre).

**Possíveis ângulos** (priorizar via spec):
- Layout responsivo melhor em mobile (hoje grid de 12 cols espreme
  ranges em 2-cols apertados).
- Visual coherência de chips (variants `mood`/`ctx` vs Camelot
  buttons — unificar?).
- Feedback visual de "0 candidatos com este filtro" (relaciona com
  a mudança semântica do Inc 28 Frente C — chip picker hoje pode
  mostrar moods/contexts sem candidatos resultantes; UX confusa).
- "Limpar" individual por seção (ex: limpar só moods, sem afetar BPM).
- Drawer mobile dedicado pra filtros (hoje fica inline, polui scroll).
- Indicador visual de quantos candidatos correspondem a cada chip
  (preview "(N)" ao lado do label?).

Sem schema delta esperado. Esforço estimado: 1-2h via speckit
quando atacar (depende do escopo escolhido).

#### Incremento 25 — Denormalizar agregações de tracks em records (pacote pós-Inc 26)

**Status atualizado pós Inc 26 (2026-05-02)**: a Fase A original foi
parcial e totalmente absorvida pelo Inc 26. A1 (dedup `getUserFacets`
via `react.cache()`), A2 (TTL `computeBadgeActive` — desnecessário
porque `<SyncBadge>` foi removido), e A4 (LIMIT em `listCuradoriaIds`
— rota `/curadoria` foi deletada) saíram. Sobra A3 (recompute em
`unstable_after`) + Fase B inteira (denormalizar counts em `records`).

Pós Inc 26, 1 load `/` faz **6 queries** (era 17). Próximo gargalo:
das 6 queries restantes, 3 são o trio `queryCollection` records +
trackAgg + bombs. Denormalizar counts elimina 2 dessas 3.

**A3 (residual) — `recomputeFacets` em `unstable_after()` (Next 15)**

- Hoje: síncrono no fim de 6+ Server Actions de write (~40k reads cada).
  Bloqueia resposta do clique até completar.
- Move pra background via `import { unstable_after as after } from 'next/server'`.
- Mutation retorna instant (UX), recompute roda fora do request.
- Não reduz contagem total mas elimina latência + risco de timeout em
  Vercel Hobby maxDuration 60s.
- Arquivos: [src/lib/actions.ts](src/lib/actions.ts) (5 callsites),
  [src/lib/discogs/sync.ts](src/lib/discogs/sync.ts),
  [src/lib/discogs/import.ts](src/lib/discogs/import.ts).
- Ganho: latência -50% em writes, mesmas reads no agregado.
- Pode ser feito junto com Fase B abaixo, ou separado.

**Fase B — Big win: denormalizar agregações de tracks em `records` (~1-2h)**

B1. **Schema delta — 3 colunas em `records`**
```
tracksTotal     INTEGER NOT NULL DEFAULT 0
tracksSelected  INTEGER NOT NULL DEFAULT 0
hasBombs        INTEGER NOT NULL DEFAULT 0  -- boolean
```

B2. **Hook centralizado `recomputeRecordCounts(recordId)`**
- 1 UPDATE em `records` setando os 3 campos via subqueries SELECT COUNT
- Custo: ~5-10 reads (1 record + ~5 tracks médios)
- Chamado em:
  - `updateTrackCuration` (após UPDATE da track) — afeta selected/isBomb
  - `applyDiscogsUpdate` (após INSERT/DELETE de tracks) — afeta total
  - `archiveRecord` não chama (archived é flag separada, counts ainda válidos)

B3. **`queryCollectionRaw` simplificado**
- Remove subquery `trackAggRows` (50 records × ~10 tracks = ~500 reads)
- Remove subquery `bombRows` (~50 reads)
- Lê direto de `records.tracksTotal/Selected/hasBombs` (já no SELECT base)
- Resultado: 3 queries → 1 query por load

B4. **Backfill — `scripts/_backfill-record-counts.mjs`**
- Mesmo padrão Inc 24: roda 1× via env de prod
- Para cada record, agrega tracks e UPDATE
- Custo do backfill: ~10k reads (rodado uma vez)

B5. **Validação opcional via `recomputeFacets`**
- `recomputeFacets` (que continua existindo pra genres/styles/etc) ganha
  flag `validateRecordCounts` que compara denormalizado vs computed
  e loga divergência sem bloquear
- Defesa em profundidade contra drift

**Ganho estimado fase B**: ~25k reads/dia → ~2.5k reads/dia em loads de
`/` (10× ganho na query mais quente).

**Total estimado pacote A+B**: ~30k reads/dia economizados → home load
cai pra ~5-10k reads (vs 69k atuais).

**Princípios:**
- I (Soberania): novos campos `tracksTotal/Selected/hasBombs` são zona
  SYS (cache materializado), não AUTHOR. Sync nunca altera diretamente
  (vai via hook após mutation de tracks).
- II (Server-First): hooks rodam em Server Actions, RSCs leem direto
  de `records`.
- III (Schema verdade): 1 schema delta de 3 colunas. Migration via
  Turso shell (mesmo padrão Inc 010/012/013/022/023).
- IV (Preservar): nada deletado, apenas adições.
- V (Mobile): zero mudança visual.

**Pré-requisito speckit**: este BACKLOG entry é input de
`/speckit.specify` quando for atacar. Não há decisões pendentes —
escopo claro, dados quantificados, riscos identificados (drift via
hook esquecido).

**Janela de execução**: priorizar quando cota Turso voltar a apertar OU
preventivamente antes de mais usuários. Não-urgente se Inc 24 sozinho
manter consumo sustentável.

#### Incremento 12 — YouTube embed inline no preview de áudio
Hoje (008) o botão **↗ YouTube** abre busca em nova aba — DJ ainda
sai do Sulco e escolhe vídeo manualmente. Evolução natural: trazer o
1º resultado da busca pra dentro da página, num iframe oficial do
YouTube, junto com os outros 2 botões (▶ Deezer / ↗ Spotify). Vira
opção de "ouvir full-length sem sair" quando Deezer não tem ou DJ
quer mais que 30s.

Escopo provável:
- **YouTube Data API v3** (`search.list?q=<artist+title>&maxResults=1&type=video`)
  pra resolver `videoId` do 1º hit. Quota: 100 unidades por chamada
  de search (10k/dia free → ~100 buscas/dia). Mais que suficiente
  pro uso solo do Felipe; cache em coluna nova `tracks.youtubeVideoId`
  + `youtubeVideoIdCachedAt` (zona SYS, mesmo padrão Deezer do 008).
- Server Action `resolveTrackYoutubeEmbed(trackId)` análoga a
  `resolveTrackPreview` — lazy on-demand, com ownership check e
  Princípio I respeitado.
- UI: botão `▶ YouTube` (sem ↗) que troca o iframe inline em vez de
  abrir nova aba. Player oficial do YouTube via `<iframe src="https://www.youtube.com/embed/<videoId>">` —
  responsivo, com handling de player events.
- Preserva ↗ Spotify e ▶ Deezer; ↗ YouTube atual vira embed interno.

Decisões pendentes pra `/speckit.specify`:
- Token YouTube API: env var `YOUTUBE_API_KEY` (chave server-side,
  não exposta ao cliente).
- "1 player ativo por vez" (FR-007 do 008): incluir o iframe YouTube
  no Context global ou deixar separado? (DJ podia querer ouvir Deezer
  + YouTube em paralelo? — provavelmente não.)
- Falso match no 1º resultado: cobrir caso "vídeo errado" com botão
  pra abrir busca completa (degrada pro comportamento atual de ↗).
- Scrub e volume: player YouTube oficial já oferece — sem refatorar.

Estimativa: 1-2 dias via speckit. Schema delta de 2 colunas
adicional (mesmo padrão 008).

Registrado a pedido em 2026-04-26 após validação manual do 008.

#### Incremento 22 — Paginação na home
Hoje `queryCollection` em `src/lib/queries/collection.ts` carrega
**TODOS** os records do user (~2500) sem paginação, mais a
agregação de tracks (~10k row reads) e lookup de bombs (~500).
Total: **~12.5k row reads por visita à home**.

Custo real: estourou cota Turso em 2026-04-30 (free tier). O
hotfix imediato adiciona cache (`unstable_cache`) que mitiga
visitas repetidas, mas o **worst case** (cache miss / DJ
abrindo após write) continua sendo 12.5k reads.

Paginação reduz cada cache miss de **12.5k → ~250 reads**
(50 records × ~4 tracks médio em aggregation). Combinado com
cache: **>98% redução** no worst case.

Escopo:
- **Page size**: 50 ou 100 records (decidir no speckit).
- **UX**: decidir entre:
  1. **Page numbers clássico** (`?page=2`, `?page=3`, com
     anterior/próxima) — mais previsível, menor surprise factor.
  2. **Infinite scroll** via IntersectionObserver — mais fluido
     mobile, mas perde scroll position ao navegar; requer
     virtualização eventual.
  3. **Load more button** — meio-termo; explícito e cumulativo.
  Recomendação inicial: page numbers (option 1) — alinha com
  estética editorial; mobile usa o mesmo controle.
- **Match counts dos filtros** (`<FilterBar>` mostra "12 ativos
  · 47 unrated"): manter contagem **global** (não paginada) via
  `collectionCounts` separado — sem regressão.
- **Filtro `unrated` da home** + botão 🎲 (Inc 11): random
  continua sobre todo o conjunto elegível (não paginado), via
  `pickRandomUnratedRecord` separado.
- **`queryCollection` ganha** `{ page: number, pageSize: number }`
  — `LIMIT pageSize OFFSET (page - 1) * pageSize`.
- Componente `<Paginator>` novo (manual, sem libs — constituição
  proíbe shadcn).
- Princípio V (Mobile-Native): paginator com tap target ≥44 px
  em mobile.

Decisões pendentes pra `/speckit.clarify` (algumas):
- Page numbers vs infinite scroll vs load more (UX).
- Page size (50 vs 100 vs ajustável pelo DJ).
- Comportamento ao mudar filtro: reset pra page 1 ou tentar
  manter? (Reset é o esperado.)
- Persistir page no URL via `?page=N`: provavelmente sim — link
  shareable e back button funciona naturalmente.

Princípios:
- **Princípio I**: leitura, sem zona AUTHOR tocada.
- **Princípio II**: `queryCollection` continua RSC; pagination
  via searchParam URL → re-render server.
- **Princípio V**: paginator responsive, tap targets adequados.

Sem schema delta. Sem novas Server Actions. Refator localizado
em `queryCollection` + `<FilterBar>` + `/page.tsx` + componente
`<Paginator>` novo.

Estimativa: 2-3h via speckit.

Registrado a pedido em 2026-04-30 após estouro de cota Turso —
identificada paginação como segundo maior ganho (~98% redução
no worst case quando combinada com cache).

#### Incremento 20 — Edição em massa de discos (multi-select)
Hoje toda mudança de campo (status, shelf, notes) é feita
disco-a-disco. DJ que organizou 30 discos novos numa prateleira
nova precisa abrir cada um pra setar `shelfLocation`. Multiplica
por número de discos por vez de cada operação.

Escopo:
- **Modo seleção** na grid (`/`): toggle (botão "Selecionar"
  ou Cmd/Ctrl+click) que ativa checkboxes em cada card.
  DJ marca discos com clique no checkbox.
- **Toolbar de ações em massa** que aparece quando ≥1 disco
  selecionado, com:
  - `Ativar todos` / `Descartar todos` / `Reativar todos`
    (status — pré-requisito Inc 19 entregue)
  - `Mover pra prateleira…` → abre o picker do Inc 21
  - Possíveis no futuro: notas em massa, deletar em massa
    (Inc 6).
- **Confirmação** pra mudanças em ≥5 discos (texto-livre): 
  "Aplicar X em N discos?". Pra <5, sem confirm (igual a
  ações individuais).
- **Selecionar todos** visíveis (com filtro ativo) — não tudo
  do DB, só o que o filtro mostra.
- **Otimistic UI** com revalidação após sucesso. Em caso de
  falha parcial (1 dos N falhou), mostrar erro contextual
  e quais persistiram.

Decisões pendentes pra `/speckit.specify`:
- **Threshold de confirm**: 5? 10? 20? Provavelmente 5 — pequeno
  o bastante pra erro ser caro, grande o bastante pra não
  atrapalhar fluxo normal.
- **Server Action**: bulk single-statement por campo
  (UPDATE … WHERE id IN (…)) ou loop de chamadas individuais?
  Bulk é mais barato e atômico — preferir.
- **Estado de seleção**: persiste entre filtros? Acho que sim
  (DJ pode filtrar pra refinar, depois selecionar mais sem
  perder o set anterior). Mas confirmar.
- **Mobile**: long-press ativa modo seleção? Pattern iOS.
  Avaliar.

Pré-requisitos: **Inc 19 entregue** (status na grid) + **Inc
21 entregue** (shelf picker). Sem essas duas, multi-select
acelera muito menos.

Princípio I OK: campos AUTHOR seguem editáveis por DJ.
Princípio IV OK: nenhum delete (mudança de status é reversível).
Princípio V: toolbar precisa caber em mobile sem scroll
horizontal; checkboxes com tap target adequado.

Estimativa: 1 dia via speckit. Sem schema delta.

Registrado a pedido em 2026-04-29 — fricção em editar mesmo
campo em vários discos sequencialmente.

#### Incremento 8 — Refatoração UX dos filtros multi-facet (gênero/estilo)
Acervo do Felipe tem 150+ estilos catalogados; quando o DJ expande os
filtros vira parede de chips intransitável. Tentativa de inline-search
foi revertida (ficou ruim visual).

Direções a explorar:
1. **Combobox/popover** (recomendado) — trigger "+ adicionar gênero/estilo"
   abre popover com busca + virtualização + keyboard nav. Padrão Linear/
   Notion/GitHub. Implementação manual (constituição proíbe shadcn).
2. **Drawer lateral** — painel dedicado com todos os filtros agrupados.
3. **Categorização hierárquica** — mapear estilos em famílias.
4. **Search-only radical** — sem lista, só input com sugestões.

Critérios de sucesso: selecionar 1 estilo entre 150 em ≤ 5s, sem inflar
página verticalmente.

Estimativa: 1 dia. Sem schema delta.

---

### 🟡 Médios (próximos meses)

#### Incremento 9 — Batch enrich sob demanda em /conta (multi-user)
Hoje o pipeline 005 on-demand (botão em `/disco/[id]`) já funciona pra
qualquer DJ. Mas acervo recém-importado começa vazio de audio features
e cobertura cresce disco-a-disco — leva semanas.

Solução: botão "🪄 Buscar sugestões pra todo o acervo" em `/conta`. DJ
clica uma vez após onboarding, batch processa em background.

Constraints Vercel Hobby (60s max em Server Actions) tornam síncrono
inviável. Caminhos:
1. **Cron + flag** (recomendado) — coluna `users.enrich_requested_at`,
   cron diário processa users marcados via `enrichUserBacklog` (re-introduzido
   só pra esse caso), limpa flag ao terminar
2. Chunking iterativo — Server Action processa N discos por click
3. Background queue (Inngest/QStash) — overkill pro piloto

Estimativa: meio dia. **Gating: quando 3º DJ entrar no piloto** (com
2 users, batch via `scripts/_enrich-batch.mjs` ad-hoc é viável).

---

### ⚪ Não-priorizados

#### Incremento 2b — PWA (manifest + service worker + offline)
Pré-requisito **009 entregue** (responsividade mobile-first ✅).
Próximo passo natural pra DJ instalar o Sulco como app no celular.

Escopo:
- `manifest.json` com nome, ícones (192/512), theme-color, display
  standalone, scope, start_url
- Ícones SVG/PNG seguindo a estética editorial (logo "Sulco." em
  fundo paper)
- `<link rel="manifest">` + meta theme-color em `layout.tsx`
- Service worker básico (next-pwa ou manual): cache de assets
  estáticos + offline fallback page mínima
- Detecção "Add to Home Screen" prompt (iOS Safari + Android Chrome)
- Splash screen automático via manifest

**Não inclui** (escopo separado se virar dor real):
- Background sync de queries
- Push notifications
- Cache aggressive de dados de Discogs/Deezer

Estimativa: 1-2 dias via speckit. Sem schema delta.

Registrado a pedido em 2026-04-27 após 009 completo (responsividade).

#### Incremento 2 — Gestos avançados mobile (swipe)
- Swipe entre faixas no `/disco/[id]` (substitui scroll por
  navegação gestual)
- Swipe pra adicionar/remover candidata em `/sets/[id]/montar`
- Drag-to-close real no `<MobileDrawer>` e `<FilterBottomSheet>`
- Pull-to-refresh em listagens

**Quando fazer**: depois de feedback de uso real do 009 indicando
fricção pontual. Pode requerer biblioteca de gestures (Framer Motion
ou similar) — avaliar trade-off com a constituição.

#### Incremento 3 — Playlists (blocos reutilizáveis)
Schema já existe (`playlists`, `playlist_tracks` com `user_id` FK
CASCADE). Rotas `/playlists*` seguem 404 até produto definir.

**Quando fazer**: se cansar de re-criar mesmo bloco em vários sets.

#### Incremento 4 — Notificações por email (convites + alertas)
Hoje owner adiciona email em `/admin/convites` mas sistema NÃO dispara
email automático — owner compartilha URL manualmente.

Escopo: integrar Resend (ou similar), template pt-BR, opcional alerta
pro owner em eventos relevantes. Env var nova: `RESEND_API_KEY`.

#### Incremento 6 — Fluxo de exclusão de álbum manual
Hoje Sulco só arquiva discos que saíram do Discogs (Princípio IV).
Falta fluxo explícito pro DJ remover manualmente um disco que ele
não quer mais (vendeu, comprou errado, desistiu).

Escopo:
- Botão "Remover da coleção" em `/disco/[id]` na sidebar
- Modal de confirmação exigindo digitar título
- **Decisão pendente**: cascade total (tracks + set_tracks) vs
  preservar em sets finalizados (soft-delete)
- Auditoria em `sync_runs` kind='manual_delete'
- Edge case: avisar se track está em set "em montagem"

Princípio I permanece: ação irreversível, só DJ inicia. Zero impacto
no Discogs.

---

## Bugs

### Abertos

(nenhum aberto no momento)

### Histórico (fechados)

- **Bug 16** — `<ImportPoller>` global rodando setInterval 10s em todas as rotas autenticadas após import completo, chamando `getImportProgress` (~10 reads cada) — gerava ~86k reads/dia desnecessários quando user mantinha aba aberta. Identificado pós-deploy 022 ao monitorar ainda crescer 666k em 24h sem uso ativo do app — log Vercel mostrou `POST /` a cada 10s. ✅ fix direto sem speckit (autorizado pelo mantenedor; encapsulado no pacote 022): (a) `<ImportPoller>` removido do layout global e arquivo deletado — o `<ImportProgressCard>` da home tem polling próprio de 3s só durante import ativo, o que basta; (b) `getImportProgress` ganhou `cacheUser` com TTL 10s aplicado APENAS na parte de leitura (split de `getImportProgressReadRaw` cached + `killZombieSyncRuns` fora do cache pra preservar o write side-effect). Reduz reads do polling do card em ~70% durante import ativo; cobre Inc 23 follow-up.
- **Bug 15** — Shelf picker (Inc 21) renderizava popover desktop **e** bottom sheet mobile ao mesmo tempo em viewport desktop (lista duplicada visível: uma flutuando dentro do card, outra fixa no rodapé fullscreen) — ✅ fix direto sem speckit (autorizado pelo mantenedor pós-deploy 020). Causa raiz: `<MobileDrawer>` cria portal em `document.body` e o `md:hidden` do wrapper externo não alcança conteúdo portaled (Tailwind responsive não cobre portais). Fix: detecção JS de viewport via `window.matchMedia('(max-width: 767px)')` + `useEffect` no `<ShelfPicker>`, com state `isMobile`; renderização condicional de **apenas uma** das variantes (popover absoluto OU MobileDrawer). SSR-safe (default `isMobile=false`, hidrata como desktop). Commit `0615c24`.
- **Bug 14** — Bloco "Análise" não ocupava 100% da largura no mobile —
  ✅ fix direto sem speckit (commit a seguir, autorizado pelo
  mantenedor pra ser CSS-only). `md:col-span-2` Tailwind responsive
  trocado por `style={{ gridColumn: 'span 2' }}` inline (mesmo pattern
  do `<Field>` adjacente que já funciona em mobile). +`w-full` defensivo
  no outer e `block w-full` na textarea. Header do bloco ganha
  `flex-wrap gap-2` pra acomodar viewport estreita.
- **Bug 13** — Banner de import permanente na home — ✅ Incremento
  010 (`specs/010-fix-import-banner-acknowledge/`). Schema delta aditivo
  `users.import_acknowledged_at`; `getImportProgress` expõe `runStartedAt`
  + `lastAck`; `<ImportProgressCard>` renderiza só em running OR
  (terminal AND lastAck < runStartedAt); botão "× fechar" via
  `acknowledgeImportProgress` Server Action.

- **Bug 8** — Sync trava em "em andamento" — ✅ commit `1952d33`
  (`killZombieSyncRuns` passivo no `loadStatusSnapshot`)
- **Bug 8b** — Botão "cancelar" pra sync manual em curso — ✅ Server
  Action `cancelRunningSync` + link "Cancelar sync" no `<ManualSyncButton>`
  quando há run em `running`
- **Bug 9** — Filtros de coleção em estilos/gêneros — 🔒 já existia
  (descoberto em investigação 2026-04-24, `<FilterBar>`)
- **Bug 10** — Curadoria aleatória direto pro disco — ✅ commit `8286226`
  (entregue como Incremento 006 com botão 🎲 na home)
- **Bug 11** — Primeiro sync manual estoura Vercel timeout — ✅ Incremento
  007 (`specs/007-fix-sync-snapshot-fallback/`). Causa raiz: `fetchRelease`
  era chamado pra TODOS 100 discos da 1ª página mesmo os já existentes
  → 100s de requests Discogs → timeout 60s. Fix: skip `fetchRelease`
  quando disco já existe em `records`. Snapshot fallback manual↔daily_auto
  pra herdar primeira execução.
- **Bug 12** — Sync archives falso-positivo quando disco é empurrado
  pra fora da 1ª página por novos adicionados — ✅ Incremento 007
  (escopo final). Causa raiz mais profunda do que parecia: sync
  incremental só comparava 1ª página, falhando em (a) detectar
  removidos antigos e (b) gerar falso-positivo de empurrados.
  **Fix**: paginar a coleção INTEIRA (~30s pra acervo de 2600 discos)
  e comparar `localIds` (records ativos) vs `currentIds` (todas as
  páginas). Se não está no Discogs paginado, archive direto. Tentativa
  intermediária com `existsInUserCollection` foi descartada — endpoint
  Discogs `/collection/folders/0/releases/{id}` não responde GET
  (HTTP 405).

---

## Backlog de ideias

Ideias não-comprometidas. Gating: cada uma precisa virar discussão
estruturada antes de subir pra Roadmap como Incremento numerado.

- **Modal de confirmação custom** — substituir `window.confirm()` (em
  uso no Inc 14 e potencialmente outros lugares) por um modal próprio
  alinhado à estética editorial (NYT Magazine + Teenage Engineering).
  Registrado a pedido em 2026-04-28 (analyze do Inc 14, finding U2).
- **Modo aleatório por gênero** — sortear disco unrated dentro de
  filtro pré-aplicado. Depende de 8 (filtros) + curadoria aleatória
  (006, já em prod).
- **Histórico/anti-repetição na aleatória** — não sortear o mesmo
  disco 2 vezes na mesma sessão.
- **Sincronização reversa MB → Sulco** — quando MB ganhar dado novo
  pra MBID já resolvido, atualizar Sulco passivamente (improvável
  porque AB está congelado em 2022).
- **Auto-tagging por ML local sobre MP3** — DJ aponta pasta com seus
  MP3, ML local extrai BPM/tom/energy real. Resolve gap dos 80% do
  acervo BR sem mapeamento MB. Complexidade alta, depende de bibliotecas
  Python/Rust local; provavelmente fora do escopo Next.js puro.
- **Bulk edit de faixas** — selecionar várias tracks e editar campo
  comum (mood, context, fineGenre) de uma vez.
- **Playlists smart** — playlist gerada por filtro dinâmico ("todas
  as bombas BPM 110-130 com mood `dançante`") em vez de lista estática.

---

## Releases (entregues, em prod)

Histórico de incrementos shipped. Cada um tem `specs/NNN-*/` com
spec/plan/data-model/contracts/quickstart.

- **001** — Sulco piloto single-user · 2026-04-22 · `specs/001-sulco-piloto/`
- **002** — Multi-conta + invite + /admin · 2026-04-23 · `specs/002-multi-conta/`
- **003** — Faixas ricas no /montar · 2026-04-23 · `specs/003-faixas-ricas-montar/`
- **004** — 🚫 Spotify audio hints · ARQUIVADO (API deprecada nov/2024) · `specs/004-spotify-audio-hints-ARQUIVADO/`
- **005** — Audio features via AcousticBrainz · 2026-04-24/25 · `specs/005-acousticbrainz-audio-features/` · ~1200 faixas enriquecidas em prod (~1140 BR após batch fallback artist+title)
- **006** — Curadoria aleatória · 2026-04-24 · `specs/006-curadoria-aleatoria/`
- **007** — Fix sync snapshot fallback · 2026-04-25 · `specs/007-fix-sync-snapshot-fallback/` · resolveu Bug 11 (timeout 1º sync) + Bug 12 (falso-positivo archives) via paginação completa
- **008** — Preview de áudio Deezer + Spotify + YouTube · 2026-04-26 · `specs/008-preview-audio-deezer-spotify-youtube/` · 3 botões inline em `/disco/[id]` e `/sets/[id]/montar`; Deezer 30s player + Spotify/YouTube link-out; cache lazy on-demand em `tracks.preview_url`/`tracks.preview_url_cached_at`
- **009** — Responsividade mobile-first · 2026-04-27 · `specs/009-responsividade-mobile-first/` · todas as rotas autenticadas funcionam em viewport ≤640px sem scroll horizontal; nav drawer lateral + filtros bottom sheet + tap targets ≥44px universais; zero schema delta, zero novas Server Actions; PWA fica como Inc 2b
- **010** — Fix Bug 13 (banner de import com acknowledge) · 2026-04-27 · `specs/010-fix-import-banner-acknowledge/` · banner some após reconhecimento explícito; schema delta de 1 coluna (`users.import_acknowledged_at`); `getImportProgress` ganha `runStartedAt`/`lastAck`; Server Action nova `acknowledgeImportProgress`; running permanece não-fechável; multi-user isolation por construção
- **011** — Curadoria aleatória respeita filtros · 2026-04-27 · `specs/011-random-respects-filters/` · botão 🎲 da home lê searchParams (text/genres/styles/bomba) e passa pra `pickRandomUnratedRecord`; helper `buildCollectionFilters` extraído de `queryCollection` e compartilhado (FR-004 paridade semântica); empty state contextual ("Nenhum disco unrated com esses filtros"); status filter da URL intencionalmente ignorado; zero schema delta
- **012** — Configuração de IA do DJ (BYOK) · 2026-04-28 · `specs/012-ai-byok-config/` · 5 providers suportados (Gemini, Anthropic, OpenAI, DeepSeek, Qwen) via adapter pattern em `src/lib/ai/`; schema delta de 3 colunas em users (aiProvider/aiModel/aiApiKeyEncrypted); criptografia reusa MASTER_ENCRYPTION_KEY via aliases encryptSecret/decryptSecret; "Testar" é único caminho de salvar (FR-005); timeout 10s; trocar provider apaga key com confirmação; tela em /conta seção "Inteligência Artificial"; pré-requisito de Inc 13 e Inc 1
- **013** — Análise da faixa via IA · 2026-04-28 · `specs/013-ai-track-analysis/` · botão "✨ Analisar com IA" por faixa em /disco/[id]; campo novo tracks.ai_analysis (AUTHOR híbrido — IA escreve via clique do DJ, DJ pode editar livremente); 2 Server Actions (analyzeTrackWithAI com Promise.race 30s + updateTrackAiAnalysis pra edição manual); reusa enrichTrackComment do Inc 14; bloco "Análise" sempre visível com placeholder; re-gerar com confirmação; bump constitucional 1.1.0 (aiAnalysis adicionado à lista AUTHOR de tracks)
- **014** — Briefing com IA em /sets/montar · 2026-04-28 · `specs/014-ai-set-suggestions/` · botão "✨ Sugerir com IA" em /sets/[id]/montar; Server Action `suggestSetTracks` orquestra ownership + briefing + setTracks (L2 sem ceiling) + catálogo via `queryCandidates` estendida com `rankByCuration` (L3 ceiling 50, score = 9 campos AUTHOR não-nulos); prompt builder em src/lib/prompts/set-suggestions.ts com parse JSON defensivo (regex fenced + inline + Zod); reusa <CandidateRow> com prop opcional `aiSuggestion` (badge + justificativa); cards adicionados permanecem visíveis; sem batch (DJ adiciona uma a uma); IA propõe apenas complementos; curto-circuito quando catálogo elegível vazio; timeout 60s; briefing truncado em 2000 chars; payload reduzido (só candidates referenciados)
- **015** — UI rework sugestões IA inline (Inc 16) · 2026-04-28 · `specs/015-ai-suggestions-inline/` · sugestões IA viram cards inline no topo da listagem de candidatos com moldura accent (border-2/60) + bg paper-raised + badge solid (bg-accent text-paper) + justificativa em destaque (text-[15px] text-ink leading-relaxed); painel reposicionado abaixo dos filtros (briefing → filtros → MontarCandidates); botão "Ignorar sugestões" reseta state client-side ≤200ms; dedup de trackIds (sugestão vs comum) garante zero duplicação visual; <MontarCandidates> client wrapper substitui <AISuggestionsPanel> (deletado); zero schema delta, zero novas Server Actions
- **016** — Editar briefing/set após criação (Inc 15) · 2026-04-28 · `specs/016-edit-set-fields/` · botão "✏️ Editar set" no header de /sets/[id]/montar abre modal com 4 campos pré-preenchidos (name/eventDate/location/briefing); reusa updateSet existente (partial update + ownership + normalizeDate + revalidatePath nas 3 rotas); pattern espelha <DeleteAccountModal>; ESC + clique fora fecham; reset on reopen via useEffect descarta edits cancelados; edição de briefing alimenta IA imediatamente; zero schema delta, zero novas Server Actions
- **017** — Botão "Reconhecer tudo" no banner de archived (Inc 11) · 2026-04-28 · `specs/017-acknowledge-all-archived/` · header da seção "Discos arquivados" em /status ganha botão bulk quando há ≥2 pendentes; Server Action nova `acknowledgeAllArchived()` (sem input, deriva userId da sessão) faz UPDATE single-statement com `WHERE userId = ? AND archived = 1 AND archivedAcknowledgedAt IS NULL` — atomicidade garantida pelo SQLite; client component `<AcknowledgeAllArchivedButton>` com useTransition + window.confirm("Marcar todos os N como reconhecidos?") + disabled "Reconhecendo…" durante isPending; threshold ≥2 (com 1 pendente, botão individual basta); revalidatePath('/status')+('/'); banner global some em todas as rotas; tap target min-h-[44px] (Princípio V); multi-user isolation via WHERE userId; `acknowledgeArchivedRecord` individual intacto; zero schema delta
- **018** — Análise IA + glyph de expandir nos cards de candidato (Inc 17) · 2026-04-28 · `specs/018-candidate-ai-analysis-glyph/` · 2 ajustes UX no `<CandidateRow>` em /sets/[id]/montar: (1) tipo `Candidate` ganha `aiAnalysis: string | null` e `queryCandidates` adiciona o campo ao SELECT (corrige incoerência onde score `rankByCuration` referenciava o campo sem carregá-lo); seção "Análise" renderiza no col-1 do expandido abaixo de comment/references quando `aiAnalysis.trim().length > 0`, read-only (label-tech ink-mute + serif italic 13px text-ink whitespace-pre-line, sem aspas — coerente com `<TrackCurationRow>` em /disco/[id]); (2) glyph de toggle do botão expand muda de `▾`/`▸` para `−` (U+2212) / `+` (U+002B) — ASCII universal, zero ambiguidade com `▶` dos botões de preview Inc 008, ARIA preservado; zero schema delta, zero novas Server Actions, refator localizado em 2 arquivos
- **019** — Editar status do disco direto na grid (Inc 19) · 2026-04-29 · `specs/019-edit-status-on-grid/` · botões inline `Ativar`/`Descartar`/`Reativar` em cada item da grid `/` (ambas views — `<RecordRow>` list + `<RecordGridCard>` grid) com optimistic UI ≤100ms via `useTransition` + `useState<optimistic>`; rollback visual em erro com mensagem inline auto-dismiss 5s (Clarification Q2 — toast-like, sem botão fechar); pattern Inbox-zero (Clarification Q1) — card some naturalmente após `revalidatePath('/')` quando filtro corrente exclui novo status; reusa Server Action `updateRecordStatus` existente (Zod + ownership + revalidatePath nas 3 rotas) sem mudança; botões condicionais por status (`unrated` → Ativar+Descartar; `active` → Descartar; `discarded` → Reativar) com `aria-label` descritivo + tap target `min-h-[44px] md:min-h-[32px]` (Princípio V mobile + densidade desktop); discos `archived` ficam fora (filtrados pela query); 1 client component novo `<RecordStatusActions>` compartilhado entre as duas views via prop `className`; zero schema delta, zero novas Server Actions
- **020** — Prateleira como select picker com auto-add (Inc 21) · 2026-04-29 · `specs/020-shelf-picker-autoadd/` · substitui o `<input type="text">` da seção Prateleira em `/disco/[id]` por combobox `<ShelfPicker>` com (a) lista distinct de prateleiras do user via novo helper `listUserShelves(userId)` em `src/lib/queries/collection.ts` (selectDistinct + ORDER BY lower(...)), (b) busca incremental case-insensitive por substring, (c) "+ Adicionar 'X' como nova prateleira" como último item quando termo não bate exatamente com nenhum existente (case-sensitive match), (d) "— Sem prateleira —" como primeiro item para limpar (NULL); reusa Server Action `updateRecordAuthorFields` existente sem mudança; `useTransition` + `useState<optimistic>` + auto-dismiss 5s pra erro (mesma UX Inc 19); desktop popover absoluto + mobile bottom sheet via `<MobileDrawer side="bottom">` (primitiva Inc 009) — mesma `<ListPanel>` em ambos via `md:` Tailwind; ARIA combobox completo (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`); navegação por teclado (↑/↓/Enter/Escape); tap target `min-h-[44px] md:min-h-[36px]` (Princípio V); casing preservado (Decisão 1 do research — apenas `trim()`, sem UPPERCASE forçado); ordem alfabética case-insensitive (não LRU); empty state acolhedor; zero schema delta, zero novas Server Actions de escrita; pré-requisito UX do Inc 20 (multi-select bulk edit). Bug 15 hotfix incluído (commit `0615c24`): MobileDrawer vazava em desktop por portal — fix com `matchMedia` + render condicional.
- **021** — Busca insensitive a acentos (Inc 18) · 2026-04-30 · `specs/021-accent-insensitive-search/` · busca textual em `/` (home) e `/sets/[id]/montar` agora normaliza diacríticos antes de comparar — digitar `joao` acha `João Gilberto`, `acucar` acha `Açúcar`, `sergio` acha `Sérgio`, bidirecional (FR-003); novo helper puro `normalizeText(s)` em `src/lib/text.ts` (`lowercase + NFD + replace(/\p{M}/gu, '')`) + helper auxiliar `matchesNormalizedText(haystacks, query)` para DRY; cobertura universal Unicode (não só pt-BR — `naive`/`naïve`, `cafe`/`café`, `garcon`/`garçon`); JS-side post-query (SQLite/Turso não tem `unaccent` nativo): `buildCollectionFilters` ganha flag opcional `omitText` (default false); `queryCollection` carrega rows com filtros não-text via SQL e aplica `matchesNormalizedText` em `[artist, title, label]` antes da agregação de tracks; `queryCandidates` remove LIKE textual SQL + move `.limit()` pra JS (`slice(0, opts.limit ?? 300)`) APÓS filtro JS pra preservar candidatos válidos; `pickRandomUnratedRecord` (Inc 11) re-estrutura: SELECT amplo sem text → JS post-filter → `Math.random()` JS sobre filtrados (preserva uniformidade); filtros multi-select de tag (genres, styles, moods, contexts) permanecem exact match (vocabulário canônico — Decisão 8 do research) — `fineGenre` (texto livre) entra no text filter geral; zero schema delta, zero novas Server Actions; refator localizado em 4 arquivos. Princípios I/II/III/V todos OK.
- **026** — Otimização do fluxo de montar set (Inc 28) · 2026-05-02 · `specs/026-montar-set-perf/` · ataca o gargalo do `/sets/[id]/montar` em 4 frentes. **Frente C**: `listSelectedVocab` em [src/lib/queries/montar.ts](src/lib/queries/montar.ts) deriva de `user_facets.moodsJson`/`contextsJson` (Inc 24 + Inc 26 cached) em vez de scan de ~10k tracks por render. **Mudança semântica aceita pelo mantenedor**: vocab agora é o conjunto geral (archived=false), não restrito a selected+active — chip picker pode mostrar moods/contexts sem candidatos resultantes. Filtros do `/sets/[id]/montar` precisam de UX rework futuro (nota do mantenedor durante implementação). **Frente B (Inc 27 leftover)**: `aiConfigured` em `/sets/[id]/montar/page.tsx` derivado de `user.aiProvider`/`user.aiModel` cached (Inc 27 já trouxe esses campos pro `requireCurrentUser`). Eliminou 1 query/render. `getUserAIConfigStatus` em `src/lib/ai/index.ts` mantida pra `/conta/page.tsx` (caller legítimo). **Frente A — debounce filter persist**: `<MontarFiltersForm>` em [src/components/montar-filters.tsx](src/components/montar-filters.tsx) sobe de 400ms→500ms + flush on unmount via 2 `useRef` (`timerRef`, `pendingRef`) + useEffect cleanup que chama `saveMontarFilters` imediato fire-and-forget se houver pending. Antes navegação rápida descartava persist. **Frente D — `addTrackToSet`**: combina COUNT (limite 300) + COALESCE(MAX(order), -1) em 1 SELECT (era 2 separados com mesma WHERE). -1 query por add. Schema delta zero. Reversível por revert. Ganho esperado em curadoria de set (30 toggles + 20 adds + 5 removes): ~600 queries / ~1M rows reads → ~50 queries / ~5k rows reads (-99.5% rows, -92% queries). Princípios I/II/III/IV/V todos OK.
- **025** — Recompute incremental + dedups remanescentes (Inc 27) · 2026-05-02 · `specs/025-incremental-recompute/` · ataca o caminho crítico de write (curadoria em `/disco/[id]`). Diagnóstico em prod (instrumentação `[DB]` pós-Inc 26) revelou que cada edição disparava `recomputeFacets` síncrono = ~7 queries pesadas + ~50-100k rows/edição → curadoria típica de 1 disco com 30 edições = ~2M+ rows lidas (estouro confirmado de cota Turso). Pacote consolida 3 frentes em 1 release. **Frente principal — delta updates direcionados em `user_facets`**: 5 helpers novos em [src/lib/queries/user-facets.ts](src/lib/queries/user-facets.ts) (`applyRecordStatusDelta`, `applyTrackSelectedDelta`, `recomputeShelvesOnly`, `recomputeVocabularyOnly`, `applyDeltaForWrite`) substituem `recomputeFacets` em 5 Server Actions de write críticas. Edições em campos não-materializados (BPM, key, energy, comment, rating, fineGenre, references, isBomb, aiAnalysis, notes) fazem **ZERO queries de delta**. Edições em status/selected fazem 1 UPDATE atomic com `MAX(0, x ± 1)` defensivo. Mudanças em moods/contexts/shelves disparam recompute parcial APENAS daquela faceta. Helper local `setEquals` em `updateTrackCuration` evita falso-positivo quando DJ envia mesma lista em ordem diferente. **Frente B — `aiProvider`/`aiModel` em `CurrentUser` cached**: tipo estendido em `src/lib/auth.ts`; `/disco/[id]/page.tsx` deriva `aiConfigured` direto do user cached (Inc 26 + Inc 27) — eliminou 1 query/render. `aiApiKeyEncrypted` INTENCIONALMENTE FORA do cached (princípio menor exposição — chave lida apenas em `getUserAIConfig` quando provider IA é chamado). **Frente C (drift correction)**: cron diário `/api/cron/sync-daily/route.ts` ganha `recomputeFacets(userId)` por user no fim — corrige drift residual (race em `applyRecordStatusDelta`, edição via SQL direto, edge cases) em ≤24h. `recomputeFacets` permanece exportado como fallback (usado em `runIncrementalSync`/`runInitialImport`/cron). **Server Actions skip total** em `acknowledgeArchivedRecord`/`acknowledgeAllArchived` (`archived_acknowledged_at` não está em facets). Schema delta zero. Reversível por revert. Ganho esperado: curadoria de 30 edições passa de ~480 queries / ~2.1M rows → ~30 queries / ~500 rows (-99% rows, -94% queries). Em uso solo: 2-6M reads/dia → ~150 reads/dia. Cabe folgado pra escala 5-10 amigos no free tier. Princípios I/II/III/IV/V todos OK.
- **024** — Cortes UX agressivos + dedup de queries (Inc 26) · 2026-05-02 · `specs/024-ux-cuts-dedup/` · pacote pós-diagnóstico Vercel logs (instrumentação `[DB]` em `src/db/index.ts`). Reduz queries SQL por load `/` de 17 → 6 (-65%) atacando 3 vetores: (1) **dedup de RSCs paralelos** — `requireCurrentUser`/`getCurrentUser` em `src/lib/auth.ts` e `getUserFacets` em `src/lib/queries/user-facets.ts` wrappados em `cache()` do React 19 (4-5 SELECT users + 4-5 SELECT user_facets por render → 1 cada); (2) **remoção de componentes globais com baixo valor** — `<SyncBadge>` e `<ArchivedRecordsBanner>` deletados do layout (rodavam em TODA rota autenticada — info acessível via menu "Sync" → `/status`); (3) **render condicional + cron-only** — novo `getImportProgressLight()` em `actions.ts` retorna `{shouldShow: false}` em 1 SELECT mínimo no caso comum (DJ com import já reconhecido + idle), economizando ~3 queries/load; `killZombieSyncRuns` movido de `getImportProgress`/`loadStatusSnapshot` para o cron diário `/api/cron/sync-daily` (era 1 UPDATE/load — agora 1×/dia/user). **Cleanup de rota morta**: `/curadoria` deletada inteira (`src/app/curadoria/`, `curadoria-view.tsx`, `listCuradoriaIds`); helpers `loadDisc` + `compareTrackPositions` preservados em `src/lib/queries/curadoria.ts` por serem usados externamente. **Prefetch=false universal**: ~16 `<Link>` em rotas autenticadas que ainda disparavam prefetch RSC em hover ganharam `prefetch={false}`. **`CurrentUser` ganha campo `importAcknowledgedAt`** pra evitar SELECT extra no caminho condicional do home. Schema delta zero. Reversível por revert. Validado em prod via `vercel logs sulco.vercel.app --follow` — log mostra exatamente 6 linhas `[DB]` por load: 1× users + 1× user_facets + 1× sync_runs (light) + 1× records LIMIT 50 + 1× tracks aggregations + 1× tracks bombs. Princípios I/II/III/IV/V todos OK.
- **023** — Denormalização user_facets (Inc 24) · 2026-05-01 · `specs/023-user-facets-denormalization/` · materializa todas as agregações pesadas (genres, styles, moods, contexts, shelves, counts, tracks_selected_total) em 1 row por user na nova tabela `user_facets`. Reads por load da home: ~50k → ~700 (1 SELECT da row vs 7 queries que escaneavam a coleção inteira). Helper novo `src/lib/queries/user-facets.ts` com `getUserFacets(userId)` (1 SELECT, defaults seguros se row ausente) + `recomputeFacets(userId)` (UPSERT após queries pesadas via `Promise.all` paralelo). Consumidores migrados em `collection.ts` (`listUserGenres`, `listUserStyles`, `listUserShelves`, `collectionCounts`, `countSelectedTracks`) e `actions.ts` (`listUserVocabulary`, `getImportProgress.recordCount`) preservam assinaturas externas (callers não mudam). `recomputeFacets` síncrono no fim de 6 Server Actions de write (`updateRecordStatus`, `updateRecordAuthorFields`, `updateTrackCuration`, `acknowledgeArchivedRecord`, `acknowledgeAllArchived`, `runIncrementalSync`, `runInitialImport`) com try/catch defensivo (write principal nunca rollback se recompute falhar — FR-008). Schema delta: 1 tabela `user_facets` com PK em `user_id` + 5 colunas JSON + 5 contadores INTEGER + `updated_at`. Migration aplicada via `turso db shell sulco-prod`; backfill via `scripts/_backfill-user-facets.mjs` (DATABASE_URL/TOKEN env). Princípios I (facets é zona SYS, não AUTHOR), II (queries continuam RSC), III (1 tabela nova com migration explícita), IV (write nunca apaga histórico), V (renders mais rápidos cross-device) todos OK. Sustenta uso intenso dentro dos 500M reads/mês do Turso. Cache layer Inc 23 mantido em paralelo (orthogonal — facets reduz escaneamento, cache reduz hits repetidos).
- **022** — Otimização de leituras Turso (Inc 23) · 2026-04-30 · `specs/022-turso-reads-optimization/` · pacote consolidado em 3 frentes pra mitigar estouro de cota Turso. **Frente A — revert Inc 21**: `queryCandidates` re-aplica `LIMIT 1000` SQL antes do JS text filter (preserva Inc 18); `pickRandomUnratedRecord` ganha fast path `RANDOM() LIMIT 1` quando text vazio (1 read vs ~2500), slow path JS post-filter Inc 18 mantido. **Frente B — cache via `unstable_cache`**: novo helper `src/lib/cache.ts` com `cacheUser(fn, name)` + `revalidateUserCache(userId)`; tag por user `user:${userId}` invalida globalmente; TTL 300s (Clarification Q2) como guard-rail; 8 queries cacheadas (`queryCollection` com cache key composto absorvendo filtros — Clarification Q1; `collectionCounts`, `countSelectedTracks`, `listUserGenres`, `listUserStyles`, `listUserShelves`, `listUserVocabulary`, `loadStatusSnapshot`); Server Actions de write críticas chamam `revalidateUserCache(user.id)` no fim (`updateRecordStatus`, `updateRecordAuthorFields`, `updateTrackCuration`, `analyzeTrackWithAI`, `updateTrackAiAnalysis`, `acknowledgeArchivedRecord`, `acknowledgeAllArchived`, `acknowledgeImportProgress`, `enrichRecordOnDemand`, `createSet`, `runIncrementalSync`); restantes confiam no TTL fallback. **Frente C — 2 índices**: `records(user_id, archived, status)` composite + `tracks(record_id, is_bomb)` composite; aplicado em dev local; aplicação em prod via `turso db shell sulco-prod` PENDENTE (Felipe roda manualmente quando Turso renovar amanhã — `CREATE INDEX IF NOT EXISTS` é idempotente, código deployado funciona sem). UI inalterada — backend puro. Princípios I (leitura), II (RSC + cache server), III (só índices), IV (nada deletado), V (ganho cross-device) todos OK. Bug 16 hotfix incluído (commit a seguir): `<ImportPoller>` global removido do layout (rodava setInterval 10s indefinidamente) + `getImportProgress` parte de leitura cacheada com TTL 10s.

Status detalhado de cada release vive nas specs próprias (commit
references nos commits acima cobrem o histórico de fixes pós-release).
