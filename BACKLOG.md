# Backlog — Sulco

**Última atualização**: 2026-04-27 (Inc 10 entregue + Inc 13 IA registrada)

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

#### Incremento 14 — Configuração de IA do DJ (BYOK)
**Pré-requisito de Inc 13 e Inc 1**. Ao invés de o Sulco gerenciar
chaves de IA centralmente (custo + lock-in num provider), cada DJ
traz sua própria chave (BYOK = Bring Your Own Key) e escolhe o
provider/modelo que quer usar.

Vantagens:
- Zero custo operacional pro Sulco
- DJ escolhe Gemini, Claude, OpenAI conforme preferência/tier grátis
  que já tem
- Privacidade: dados não passam pela API key do mantenedor
- Reusa pattern de criptografia já existente (`encryptPAT` do Discogs)

Escopo provável (decidir no `/speckit.specify`):
- Schema delta em `users`:
  - `ai_provider`: enum (`'gemini' | 'anthropic' | 'openai'`), nullable
  - `ai_api_key_encrypted`: text, nullable (criptografado igual ao PAT)
  - `ai_model`: text, nullable (ex: `gemini-2.5-flash`,
    `claude-haiku-4-5`, `gpt-4o-mini`)
- Tela em `/conta` (seção "Inteligência Artificial"):
  - Dropdown de provider
  - Input de API key (mascarado, com "✓ verificada" após teste)
  - Dropdown de modelo (lista curada por provider — evita DJ escolher
    modelo deprecado)
  - Botão "Testar conexão" → Server Action chama o provider com
    prompt mínimo ("ping") e devolve sucesso/erro
- Adapter pattern em `src/lib/ai/`:
  - `src/lib/ai/index.ts` — interface comum `enrich(prompt, opts)`
  - `src/lib/ai/providers/gemini.ts`, `anthropic.ts`, `openai.ts`
  - Cada provider sabe converter prompt comum pro formato nativo
- Sem chave configurada → botões dependentes (Inc 13, Inc 1) ficam
  disabled com tooltip "Configure sua chave em /conta"

Decisões pendentes pra `/speckit.specify`:
- **Lista curada de modelos por provider** (que modelos aparecem no
  dropdown). Manter atualizado é dívida de manutenção — provavelmente
  hardcoded em `src/lib/ai/models.ts` com data de revisão.
- **Storage da key**: SQL encrypted (mesma estratégia do PAT) ou
  Vercel env var por user (overkill).
- **Ping test**: prompt fixo neutro ("Reply with 'ok'.") ou usa o
  primeiro caso real (gerar comment dum disco de teste)?
- **Trocar de provider perde key**: ao mudar provider, key anterior é
  apagada (UI confirma) — ou guarda histórico por provider?

Estimativa: 1-1.5 dia via speckit. Schema delta de 3 colunas + tela de
config + adapter pattern.

Registrado a pedido em 2026-04-27 como infra compartilhada entre
Inc 13 (enriquecer comment) e Inc 1 (briefing com IA em /sets).

#### Incremento 13 — Enriquecer `comment` da faixa com IA
**Depende de Inc 14** (config BYOK). Felipe testou o Gemini gerando
descrições de faixas e o resultado foi excelente (palavras dele).
Trazer pro Sulco como botão **"✨ Enriquecer com IA"** por faixa em
`/disco/[id]`. IA preenche `tracks.comment` direto (DJ pode editar
depois — sem preview/confirmação prévia). Disparo **manual e
intencional** (não automático/batch) pra DJ controlar quando queima
token da própria conta.

Escopo provável (decidir no `/speckit.specify`):
- Botão por faixa em `/disco/[id]` no card/row de track. Estado
  `pending` durante chamada (~2-5s).
- Server Action `enrichTrackCommentWithAI(trackId)` — auth via
  `requireCurrentUser` + ownership check (track pertence a record do
  user). Chama o adapter de IA do Inc 14 (provider escolhido pelo
  DJ), atualiza `tracks.comment`, `revalidatePath('/disco/[id]')`.
- **Prompt multi-linha**:
  - L1 essencial: `Artist - Album (Year) - Track Title (Position)`
  - L2 contexto adicional: `Genres: [...] | Styles: [...] | BPM: 120 | Key: 8A | Energy: 4`
    — só inclui campos não-nulos (audio features podem estar ausentes
    pré-005, BPM/key podem ter sido preenchidos manualmente).
- **Idioma de saída**: pt-BR (mesma língua das demais notas autorais).
- **Tom/formato**: 1 parágrafo curto (3-5 frases), descrevendo
  sensação/contexto/uso do disco. Definir no system prompt durante
  speckit.specify.
- Princípio I: `comment` é AUTHOR. IA escreve, mas é ato explícito do
  DJ (clique). Sobrescreve `comment` existente sem confirmar — DJ pode
  editar depois.
- Sem chave configurada (Inc 14 não rodou) → botão disabled com
  tooltip "Configure sua chave em /conta".
- Sem schema delta (`tracks.comment` já existe, AUTHOR field).

Decisões pendentes pra `/speckit.specify`:
- **Tratamento de erro**: API down → toast "Falha temporária, tente
  novamente" sem mexer em `comment`. Rate limit → mesma coisa.
- **Sobrescrever `comment` existente?**: spec atual diz que sim. Talvez
  abrir confirmação se já há texto não-vazio.
- **System prompt e exemplos few-shot**: definir tom em pt-BR, evitar
  alucinação sobre datas/fatos não-verificáveis, focar em sensação
  musical (não biografia).

Estimativa: 0.5-1 dia via speckit (depois de Inc 14). Botão isolado,
sem batch. Inc 9 (batch enrich em /conta) pode reusar o pipeline
quando virar dor real.

Registrado a pedido em 2026-04-27 após teste manual do Felipe com
Gemini retornando descrições de qualidade.

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

#### Incremento 1 — Briefing com IA
**Depende de Inc 14** (config BYOK). Botão "Sugerir com IA" em
`/sets/[id]/montar`:
1. Lê briefing do set
2. Busca faixas selecionadas com metadados
3. Chama o adapter de IA do Inc 14 (provider escolhido pelo DJ) com
   prompt estruturado pedindo lista ranqueada + justificativa
4. Retorna lista ranqueada — DJ revisa e adiciona ao set

**Sem env var central**: chave é do DJ via Inc 14.

**Quando fazer**: depois de ter mais sets criados pra calibrar
prompts. Inc 14 deve estar entregue antes (estrutura BYOK).

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

Status detalhado de cada release vive nas specs próprias (commit
references nos commits acima cobrem o histórico de fixes pós-release).
