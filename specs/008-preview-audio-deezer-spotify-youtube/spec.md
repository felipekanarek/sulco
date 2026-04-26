# Feature Specification: Preview de áudio (Deezer + Spotify + YouTube)

**Feature Branch**: `008-preview-audio-deezer-spotify-youtube`
**Created**: 2026-04-25
**Status**: Draft
**Input**: DJ precisa **ouvir** as faixas durante curadoria e montagem
de set. Hoje só dá pra olhar metadado (BPM/tom/energia) ou abrir
Discogs/Spotify/YouTube manualmente em outra aba — quebra fluxo.
Combo de três caminhos: (1) Deezer 30s inline via `<audio>`,
(2) Spotify link-out (full-length se DJ é Premium), (3) YouTube
link-out (fallback universal). Sem nenhuma exigência de OAuth, sem
SDK embed.

## Clarifications

### Session 2026-04-26

- Q: Após o preview Deezer terminar (30s naturais), qual o comportamento?
  → A: Para e volta pro estado ▶ inicial. DJ aciona de novo se quiser
  ouvir mais. Sem loop, sem auto-advance.
- Q: Comportamento quando o áudio Deezer falha em tocar (URL cacheada
  morta, network)? → A: Mensagem inline curta ("Preview indisponível")
  + botão "tentar de novo" que **invalida o cache atual** e refaz a
  busca Deezer. Spotify/YouTube seguem visíveis sempre. Sem auto-fallback
  silencioso pra outras plataformas.
- Q: Feedback visual durante o loading do 1º preview (até ~3s)?
  → A: Botão troca pra indicador de carregando (animação ⟳ ou ●●●)
  e fica disabled durante a busca. Quando áudio começa, vira ⏸.
  Evita re-clicks acidentais sem ser visualmente pesado.

## User Scenarios & Testing

### User Story 1 — Ouvir faixa antes de marcar `selected` na curadoria (Priority: P1)

DJ está triando um disco em `/disco/[id]`. Olha BPM/tom/moods (sugerido
ou seu) mas precisa ouvir antes de decidir se vai discotecar. Hoje
abre Discogs/Spotify/YouTube em outra aba, perde contexto. Com a
feature: três botões inline ao lado da faixa — Deezer ▶ toca 30s
direto; Spotify/YouTube abrem nova aba pra ouvir full-length se quiser.

**Why this priority**: ouvir é parte central da curadoria. Sem isso,
DJ depende de memória ou alterna janelas.

**Independent Test**: abrir `/disco/[id]` de qualquer disco, clicar ▶
em uma faixa e ouvir 30s sem sair da página.

**Acceptance Scenarios**:

1. **Given** track com `tracks.title` + `records.artist` preenchidos,
   **When** DJ clica ▶ pela 1ª vez, **Then** o sistema busca preview
   no Deezer, cacheia URL em `tracks.previewUrl`, e toca os 30s.
2. **Given** mesma track depois do 1º click, **When** DJ clica ▶ de
   novo, **Then** toca direto do cache (sem nova call Deezer).
3. **Given** track sem preview no Deezer, **When** DJ clica ▶,
   **Then** botão Deezer fica desabilitado com tooltip "sem preview"
   e os botões Spotify/YouTube continuam funcionais.
4. **Given** DJ clica Spotify ↗, **Then** abre nova aba em
   `https://open.spotify.com/search/<artist>%20<title>` e DJ ouve no
   app/web.
5. **Given** DJ clica YouTube ↗, **Then** abre nova aba em
   `https://www.youtube.com/results?search_query=<artist>+<title>`.
6. **Given** track A tocando, **When** DJ clica ▶ da track B,
   **Then** track A pausa automaticamente e B começa.

### User Story 2 — Decidir candidato durante montagem de set (Priority: P1)

DJ está em `/sets/[id]/montar` filtrando candidatos. Vê uma faixa
com BPM e moods que parecem encaixar mas não lembra o som. Clica ▶
inline no `CandidateRow` e ouve 30s antes de adicionar à bag.

**Why this priority**: montar set sem ouvir é menos preciso; preview
inline acelera decisão.

**Independent Test**: filtrar candidatos no `/sets/[id]/montar`,
clicar ▶ em uma candidata, ouvir.

**Acceptance Scenarios**:

1. **Given** lista de candidatas com filtro aplicado, **When** DJ
   clica ▶ em qualquer linha, **Then** preview toca inline.
2. **Given** DJ clicou ▶ na linha 5, **When** clica + (adicionar)
   na linha 5, **Then** preview NÃO interrompe (continua tocando).
3. **Given** DJ clicou ▶ na linha 5, **When** clica ▶ na linha 12,
   **Then** linha 5 pausa, linha 12 começa.

### Edge Cases

- **Track sem preview Deezer disponível**: API retorna sem `preview`
  válido. Sistema cacheia marker "sem preview" pra evitar recall a
  cada click; Spotify/YouTube continuam funcionais.
- **Falso match no Deezer** (mesmo artista+título mas faixa errada):
  inevitável sem ISRC. DJ identifica auditivamente; pode reportar
  como "preview errado" em iteração futura. Por enquanto: aceito.
- **Title genérico** ("Untitled", "Faixa 1"): query Deezer fica fraca,
  pode não achar nada → fallback automático pros link-outs.
- **Vários discos do mesmo artista com mesma faixa** (regravações
  ao vivo etc.): cada `tracks.id` cacheia próprio `previewUrl`
  independente.
- **Deezer rate limit ou indisponibilidade**: Server Action retorna
  erro estruturado; UI mostra Spotify/YouTube como fallback (sempre
  visíveis); ▶ Deezer fica desabilitado nessa request mas DJ pode
  tentar de novo.
- **Track sem `tracks.title` ou `records.artist`**: schema garante
  ambos NOT NULL — não acontece. Se acontecer (corrupção de dados),
  Server Action retorna erro e UI desabilita os 3 botões.
- **Race entre 2 cliques rápidos em ▶ diferentes**: cliente cancela
  request anterior antes de iniciar nova (`AbortController`).
- **Cache "URL morta"** (Deezer remove a URL com tempo): `<audio>`
  dispara `onerror` durante reprodução; sistema mostra "Preview
  indisponível" inline + botão "tentar de novo" que invalida cache
  e refaz busca (FR-004/FR-004a). Sem TTL automático na primeira
  iteração — só recuperação reativa via click.

## Requirements

### Functional Requirements

**Resolução e cache**

- **FR-001**: Sistema MUST resolver preview Deezer via `Deezer Search API`
  (`GET https://api.deezer.com/search?q=<artist>%20<title>&limit=1`)
  no primeiro click do ▶ pra uma track. Sem auth, sem cookies.
- **FR-002**: Sistema MUST cachear o resultado em `tracks.previewUrl`
  (URL string da preview) e `tracks.previewUrlCachedAt` (timestamp).
  Quando preview indisponível, gravar marker explícito (ex:
  `previewUrl=''` + `previewUrlCachedAt=now`) pra distinguir
  "nunca tentei" de "tentei e não tem".
- **FR-003**: Em clicks subsequentes, sistema MUST tocar direto do
  cache sem nova chamada Deezer.
- **FR-004**: Botão "tentar de novo" MUST aparecer em duas situações:
  (a) cache marca "indisponível" desde a 1ª busca; (b) o player
  `<audio>` falhou ao tocar uma URL cacheada (URL morta, network
  error). Em ambos os casos, click MUST invalidar o cache atual
  (resetar `previewUrl` e `previewUrlCachedAt` pra null) e refazer
  a busca Deezer.
- **FR-004a**: Quando `<audio>` dispara `onerror` durante reprodução,
  sistema MUST exibir mensagem inline curta ("Preview indisponível")
  ao lado do botão Deezer + botão "tentar de novo" (FR-004).
  Spotify/YouTube continuam visíveis e funcionais — sem auto-fallback
  silencioso pra outras plataformas.

**UX**

- **FR-005**: 3 botões SEMPRE visíveis lado-a-lado em cada faixa:
  - **▶ Deezer** (player inline 30s) — desabilitado quando cache
    marca "sem preview"
  - **↗ Spotify** (link-out, abre nova aba)
  - **↗ YouTube** (link-out, abre nova aba)
- **FR-006**: Player Deezer MUST ter barra de progresso minimalista
  (sem volume, sem scrub manual além do que `<audio>` nativo
  oferece). Visual respeitando estética editorial pt-BR já
  estabelecida.
- **FR-006a**: Botão Deezer MUST ter 4 estados visuais distintos:
  (a) **▶** idle — pronto pra tocar; (b) **indicador de carregando**
  (⟳ animado ou similar) + disabled enquanto a Server Action resolve
  e o `<audio>` carrega; (c) **⏸** tocando; (d) **▶** + mensagem
  inline "indisponível" quando cache marca sem dado ou after onerror
  (FR-004a). Transição entre estados é imediata (sem animação
  bloqueante além do indicador).
- **FR-007**: Sistema MUST permitir apenas **1 player ativo por vez**
  no app inteiro: clicar ▶ em outra faixa pausa a anterior.
- **FR-007a**: Quando o preview Deezer termina os 30s naturalmente,
  o player MUST parar e o botão MUST voltar ao estado ▶ inicial.
  Sem loop. Sem auto-advance pra próxima faixa. Se DJ quer ouvir
  mais, clica novamente.
- **FR-008**: Spotify link MUST ser
  `https://open.spotify.com/search/<URL-encoded artist>%20<URL-encoded title>`.
- **FR-009**: YouTube link MUST ser
  `https://www.youtube.com/results?search_query=<URL-encoded artist>+<URL-encoded title>`.
- **FR-010**: Preview controls MUST aparecer em **AMBOS**:
  - `/disco/[id]` (curadoria) — em cada `<TrackCurationRow>`
  - `/sets/[id]/montar` (montagem) — em cada `<CandidateRow>`

**Backend**

- **FR-011**: Server Action `resolveTrackPreview(trackId)` MUST validar
  ownership via `records.userId = currentUser.id` antes de retornar
  qualquer dado.
- **FR-012**: Server Action retorna apenas `{ deezerUrl: string|null,
  cached: boolean }`. `deezerUrl` é `null` quando Deezer não tem preview
  (cacheado como marker `''` no DB, normalizado pra `null` no retorno).
  `cached: true` indica hit de cache (sem chamada Deezer nesta request).
  URLs de Spotify/YouTube **não** são retornadas pela Server Action: são
  geradas client-side pelos helpers puros `spotifySearchUrl(artist, title)`
  e `youtubeSearchUrl(artist, title)` em `src/lib/preview/urls.ts`
  (client-safe, sem `server-only`).
- **FR-013**: Sistema MUST registrar `tracks.previewUrlCachedAt` mesmo
  quando preview é indisponível, pra evitar re-tentativas redundantes.

**Princípio I**

- **FR-014**: `tracks.previewUrl` e `tracks.previewUrlCachedAt` MUST
  ser write-only pelo sistema. DJ NÃO edita nem visualiza esses
  campos diretamente. Não tocam em nenhum dos campos autorais
  (`bpm`, `musicalKey`, `energy`, `moods`, `comment`, etc).

**Multi-tenant**

- **FR-015**: Cada user tem suas próprias rows em `tracks` (via
  `records.userId`). Cache de preview é por-row, não compartilhado
  entre users. Naturalmente isolado pelo schema atual — sem
  vazamento.

### Key Entities

Schema delta em `tracks`:

| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| `previewUrl` | TEXT | ✅ | NULL |
| `previewUrlCachedAt` | INTEGER (timestamp) | ✅ | NULL |

Estados:
- `previewUrl=NULL && previewUrlCachedAt=NULL` → nunca tentou
- `previewUrl='' && previewUrlCachedAt=ts` → tentou, sem dado
- `previewUrl=URL && previewUrlCachedAt=ts` → tem preview cacheado

## Success Criteria

- **SC-001**: DJ consegue ouvir preview Deezer em ≤ 3s do click no ▶
  na primeira vez (resolve + cache + play). Subsequentes em <500ms
  (do cache).
- **SC-002**: Spotify/YouTube link-out abre nova aba imediatamente
  (clique → URL na address bar < 200ms; abertura depende do browser/OS).
- **SC-003**: ≥ 70% das faixas dos discos enriquecidos pelo 005
  (Spoon, Janet Jackson, Caetano Velô, Roberta Flack etc.) têm
  preview Deezer disponível na primeira tentativa. Validação: amostra
  manual de 10 discos.
- **SC-004**: Zero quebra de Princípio I — testes automatizados
  garantem que preview-write nunca toca campos autorais.

## Assumptions

- Deezer Search API permanece pública sem auth em 2026 (válido
  conforme verificado na sessão de pivot 005 — abr/2026).
- Match por `artist + title` cobre 70%+ dos casos. Falsos matches
  (mesma string em faixas diferentes) são raros e não-bloqueantes
  porque DJ identifica auditivamente.
- Spotify search URL aberta funciona pra usuários logados e não-logados
  (não-logados veem preview 30s + paywall, logados Premium ouvem full).
- YouTube search URL aberta funciona em todos os browsers, sem login.
- Browser nativo `<audio>` é suficiente — sem necessidade de player
  customizado / Web Audio API.

## Dependencies

- **Schema `tracks` atual**: precisa adicionar 2 colunas (aditivo,
  sem migração destrutiva).
- **Estética editorial**: reaproveitar primitivas de `<Chip>`,
  `<Tag>`, etc do prototype baseline. Não introduzir biblioteca de
  player externa.
- **Server Actions** já em uso pra outros writes (007 sync,
  005 enrichRecordOnDemand) — pattern estabelecido.

## Fora de escopo (neste incremento)

- **YouTube embed inline** (player iframe do 1º resultado da busca).
  Requer YouTube Data API v3 (quota 10k units/dia free) + iframe
  responsivo + handling de player events. Esforço maior; entra como
  **Incremento futuro** ("YouTube embed inline pra preview").
- **Spotify embed inline** (player oficial do Spotify). Requer
  Spotify Web Playback SDK + login Premium + token + scope. Mesmo
  motivo do 004-arquivado — não vale a complexidade pra preview-only.
- **Histórico de previews tocados**: futuro, se virar "modo radio".
- **Volume/scrub fora do `<audio>` nativo**: futuro, se DJ pedir.
- **Preview pra moods/contexts**: não faz sentido (são metadados).

## Notas de implementação (referência pra `/speckit.plan`)

Não-normativo. Decisões surgidas no briefing pra evitar perda:

- Endpoint Deezer Search: `GET https://api.deezer.com/search?q=...&limit=1`
  Retorna `{ data: [{ id, title, preview, artist: { name }, album: { title }, ... }] }`.
  `preview` é URL `cdns-preview-X.dzcdn.net/.../mp3` 30s. Pode ser
  vazia → marker "sem preview".
- Componente novo provável: `<PreviewControls trackId track={...} record={...} />`
  client component que dispara Server Action no 1º click, alimenta
  `<audio>` nativo e armazena estado de play/pause local.
- Estado "1 player por vez" via React Context (constituição proíbe
  Zustand) ou CustomEvent global (window.dispatchEvent) — decisão de
  plan.
- Cancelamento de request ao clicar outra: `AbortController` + ref.
- Schema delta via `npm run db:push` + ALTER em prod via Turso CLI
  (mesmo padrão do 005).
- Reuso de `requireCurrentUser()` + ownership check em Server Action.
- Falso-positivo de cache "URL morta": fora do escopo MVP, mas
  `<audio>` `onerror` pode disparar fallback automático pros link-outs.
- Privacidade: chamada Deezer sai do server Vercel (IP do server,
  não do DJ). YouTube/Spotify link-out abre direto no browser do
  DJ — exposição é a normal de uma aba aberta.
