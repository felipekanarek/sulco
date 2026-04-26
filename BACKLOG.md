# Backlog — Sulco

**Última atualização**: 2026-04-25

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

#### Incremento 10 — Curadoria aleatória respeita filtros aplicados
Hoje o botão 🎲 (006, em prod) sorteia entre TODOS os discos `unrated`
não-arquivados. Quando o DJ tem filtro de gênero/estilo ativo na
coleção (ex: `?style=MPB`), faz sentido o aleatório respeitar — sortear
MPB unrated em vez de qualquer disco.

Comportamento desejado:
- Botão 🎲 lê os mesmos searchParams que `<FilterBar>` (status, q,
  bomba, genre[], style[]) e passa pra Server Action
- `pickRandomUnratedRecord` aceita filtros opcionais (mesmos da
  `queryCollection`) e aplica `WHERE` na query do `ORDER BY RANDOM()`
- Se filtro retorna 0 elegíveis: feedback "Nenhum disco unrated com
  esses filtros" (atualizar mensagem do empty state)

Ganho concreto pós-batch 005: filtra "Samba" + click 🎲 → cai num
Caetano enriquecido com BPM/tom já preenchidos. Triagem temática
focada.

Sem schema delta. Esforço: ~30 min. Pode aproveitar pra adicionar o
botão também em `/curadoria` (caso a rota não seja deletada) ou em
qualquer lugar que faça sentido sortear.

Registrado a pedido em 2026-04-25.

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

#### Incremento 1 — Briefing com IA
Botão "Sugerir com IA" em `/sets/[id]/montar`:
1. Lê briefing do set
2. Busca faixas selecionadas com metadados
3. Chama Anthropic SDK (`claude-sonnet-4-7`) com prompt estruturado
4. Retorna lista ranqueada com justificativa

Env var nova: `ANTHROPIC_API_KEY`.

**Quando fazer**: depois de ter mais sets criados pra calibrar prompts.

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

#### Incremento 2 — PWA / mobile
- `next-pwa` ou manifest manual
- Curadoria adaptada pra mobile (swipe entre cards)
- `/sets/[id]/montar` responsiva

**Quando fazer**: quando houver demanda real de uso mobile.

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

#### Bug 13 — Banner de import permanente na home
Reportado em 2026-04-25. O `<ImportProgressCard>` aparece na home (`/`)
mesmo quando não há import em andamento nem recém-concluído. Esperado:

- **Em andamento** (`outcome='running'`) → banner sempre visível, não-fechável
- **Recém-concluído** (não acknowledged ainda) → banner visível com
  botão **"× fechar"**; click marca acknowledge; banner some até
  próxima execução
- **Idle/antigo** → banner não renderiza

Implementação sugerida:
- Schema delta aditivo: `users.import_acknowledged_at` (nullable)
- `getImportProgress()` retorna estado atual + lastAck
- `<ImportProgressCard>` renderiza só se: running OR (concluído AND
  lastAck < startedAt do último run)
- Server Action `acknowledgeImportProgress()` seta timestamp

Esforço: ~1h via speckit.

### Histórico (fechados)

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

Status detalhado de cada release vive nas specs próprias (commit
references nos commits acima cobrem o histórico de fixes pós-release).
