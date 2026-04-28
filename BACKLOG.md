# Backlog — Sulco

**Última atualização**: 2026-04-28 (Inc 16 entregue)

Convenção:
- **IDs preservam histórico** (Incremento N, Bug N) — não renumerar quando algo é fechado.
- Status: 🟢 priorizado · 🟡 médio · ⚪ não-priorizado · ✅ entregue · 🔒 fechado sem código

---

## Roadmap

### 🟢 Próximos (semanas)

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

#### Incremento 15 — Editar briefing e dados do set após criação
Hoje, ao criar um set em `/sets/novo`, DJ define name/eventDate/
location/briefing. Depois de criado, esses campos ficam imutáveis na
UI — pra alterar precisa abrir o DB direto. Faz sentido permitir
edição em `/sets/[id]` ou `/sets/[id]/montar`, especialmente do
briefing (DJ refina ao montar) e do eventDate (mudou de dia).

Escopo provável:
- Botão "Editar set" em `/sets/[id]/montar` (header) abre form modal
  ou inline com os 4 campos.
- Server Action `updateSet({ setId, name?, eventDate?, location?,
  briefing? })` — partial update via Zod com todos campos opcionais.
  Ownership check.
- `revalidatePath('/sets/[id]')` + `revalidatePath('/sets/[id]/montar')`.
- Edição de `name` reflete na lista `/sets`. Edição de `briefing`
  alimenta novas sugestões da IA (Inc 1).
- `montar_filters_json` NÃO entra nesse form (filtros são salvos
  inline em outra action, `saveMontarFilters`).

Princípio I respeitado: campos do set são AUTHOR puros, DJ é único
escritor — já era assim na criação.

Sem schema delta. Esforço: ~30-45min via speckit.

Registrado a pedido em 2026-04-28 após Inc 14 (sugestões IA) deixar
claro que iterar briefing pós-criação é fluxo natural.

#### Incremento 11 — Botão "Reconhecer tudo" no banner de archived
Quando sync detecta vários discos removidos do Discogs (caso típico:
DJ faz limpeza de coleção e remove 5-10 de uma vez), banner em `/sync`
mostra cada um com botão "Reconhecer" individual. Pra >5 archived,
clicar um por um vira fricção.

Escopo:
- Botão "Reconhecer tudo" no header da seção "Discos arquivados",
  abaixo do contador de pendentes
- Confirmação simples ("Marcar todos os N como reconhecidos?")
- Server Action `acknowledgeAllArchived()` faz `UPDATE records SET
  archived_acknowledged_at = now() WHERE user_id = ? AND archived = 1
  AND archived_acknowledged_at IS NULL`
- revalidatePath('/sync') no fim → banner some

Sem schema delta. Esforço: ~30 min via speckit. Reusa fluxo
existente de "Reconhecer" individual.

Registrado a pedido em 2026-04-25 após sync 268 marcar 9 archived
de uma vez (limpeza de coleção do Felipe).

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

Status detalhado de cada release vive nas specs próprias (commit
references nos commits acima cobrem o histórico de fixes pós-release).
