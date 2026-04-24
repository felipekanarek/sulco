# Feature Specification: Spotify audio hints (BPM/tom/energia + preview 30s)

**Feature Branch**: `004-spotify-audio-hints`
**Created**: 2026-04-24
**Status**: 🚫 ARQUIVADO (2026-04-24) — Inviável

## ⚠️ Nota de arquivamento (2026-04-24)

Esta spec foi arquivada **antes de ir pra `/speckit.plan`** após
descoberta de que os endpoints Spotify requeridos (`/audio-features`
e campo `preview_url` em responses de tracks) foram **deprecados em
2024-11-27 para todos os apps registrados após essa data**,
independente do tier da conta do usuário final (Premium não resolve).

Em fev/2026 o Spotify apertou ainda mais o Development Mode (limite
reduzido de 25 → 5 usuários + dono do app precisa ser Premium),
confirmando que o caminho é inviável pra projeto pessoal com
múltiplos DJs.

**Feature foi dividida em dois incrementos futuros:**
- **005 — Audio features via AcousticBrainz** (substitui
  `/audio-features`): usa ponte Discogs ISRC → MusicBrainz MBID →
  AcousticBrainz
- **5b — Preview via Deezer + YouTube** (substitui `preview_url`):
  combo Deezer API pública (30s inline) + YouTube link-out (fallback)

Ver `CLAUDE.md` seção "Incremento futuro 5" e "5b" pro desenho atual.

Spec mantida por referência histórica das decisões de escopo e
clarifications da sessão.

---

## (Conteúdo original abaixo — NÃO implementar)
**Input**: Integração Spotify opt-in por DJ pra acelerar curadoria —
audio-features (BPM, tom, energia) pré-preenchem os campos autorais
como sugestão editável, e preview 30s inline por faixa. Respeita
Princípio I da Constituição: dados do DJ nunca sobrescritos por
fontes externas sem ação explícita.

## Clarifications

### Session 2026-04-24

- Q: Qual o escopo concreto do "teste de regressão automatizado"
  em SC-005? → A: Combinação de **integration test específico** do
  guard if-null (verifica que função que recebe spotify_bpm NÃO
  altera tracks.bpm quando já preenchido) + **validação manual**
  via quickstart comparando `SELECT bpm,musical_key,energy`
  antes/depois de uma sessão de uso. Sem framework de snapshot
  automatizado do DB inteiro (custo alto vs benefício).
- Q: O que acontece com dados Spotify quando um user é deletado? →
  A: Cascade via FKs existentes — colunas spotify_* em records e
  tracks somem junto via `ON DELETE CASCADE` herdado (`records.user_id`
  e `tracks.record_id → records.id`). Tokens spotify_* em `users`
  também somem pela deleção da própria linha. Sem ação adicional:
  comportamento herdado do 001. Nenhum revoke explícito na API
  Spotify — aceita-se que o token fica "zumbi" no lado deles até
  expirar; risco mínimo pra piloto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Conectar conta Spotify (Priority: P1)

O DJ quer começar a usar as sugestões Spotify. Em `/conta`, clica em
"Conectar Spotify", autoriza no fluxo OAuth, e volta ao Sulco com a
conta conectada. Token fica cifrado no banco.

**Why this priority**: sem conexão OAuth, nenhum outro recurso do 004
funciona. É o blocker arquitetural.

**Independent Test**: DJ em `/conta` sem conexão; clica "Conectar
Spotify"; passa pelo flow OAuth Spotify; volta com mensagem "Spotify
conectado". `/conta` agora mostra "Spotify conectado como <display name>"
e oferece "Desconectar".

**Acceptance Scenarios**:

1. **Given** DJ em `/conta` sem conta Spotify conectada,
   **When** clica "Conectar Spotify",
   **Then** é redirecionado ao Spotify OAuth authorize, autoriza, e
   volta ao Sulco com sessão Spotify ativa.
2. **Given** DJ cancela no Spotify OAuth (botão "Cancelar"),
   **When** volta ao Sulco,
   **Then** vê mensagem "Conexão com Spotify cancelada" e permanece
   sem conexão. Nada persiste no banco.
3. **Given** DJ já tem Spotify conectado,
   **When** acessa `/conta`,
   **Then** vê display name Spotify + botão "Desconectar Spotify".
4. **Given** DJ clica "Desconectar Spotify",
   **When** confirma,
   **Then** token cifrado é removido do banco; dados spotify_* em
   records/tracks PERMANECEM (não são deletados).

---

### User Story 2 — Buscar e matchear um disco (Priority: P1)

DJ abre `/disco/[id]` de um disco mainstream. Clica "Buscar no
Spotify". Vê top-3 candidatos de albums Spotify. Escolhe o correto
visualmente (capa + artista + ano). Sulco salva o match e busca
audio-features de todas as faixas do disco.

**Why this priority**: é o caminho principal de consumo. Sem matching
não há sugestões.

**Independent Test**: com Spotify conectado, DJ abre disco de
artista conhecido (ex: Jorge Ben — "África Brasil"); clica "Buscar
no Spotify"; vê 3 candidatos; seleciona o certo; confirma; em <10s
vê audio-features de todas as faixas do álbum sendo salvas (BPM,
tom, energia, preview_url quando disponível).

**Acceptance Scenarios**:

1. **Given** DJ autenticado no Spotify em `/disco/[id]`,
   **When** clica "Buscar no Spotify",
   **Then** vê até 3 cards de candidatos Spotify, cada um com capa,
   nome do álbum, artista, ano e número de faixas.
2. **Given** lista de candidatos aparece,
   **When** DJ clica em um dos 3,
   **Then** modal fecha; `spotify_album_id` é salvo em `records`;
   mensagem "Álbum casado — buscando faixas..." aparece.
3. **Given** álbum casado,
   **When** Sulco busca `/albums/{id}/tracks` da Spotify,
   **Then** cada faixa do álbum Sulco é linkada a um track Spotify
   pelo match `position + title` fuzzy. Taxa de linkagem esperada
   ≥80% pra álbuns bem-casados.
4. **Given** faixas linkadas,
   **When** audio-features é buscado (batch de até 100 por call),
   **Then** colunas `spotify_bpm`, `spotify_key`, `spotify_energy`
   e `spotify_preview_url` são populadas na tabela tracks.
5. **Given** busca não retorna candidatos (álbum raro),
   **When** o modal abre,
   **Then** mostra mensagem "Nenhum candidato encontrado no Spotify"
   e botão "Fechar". Nada é salvo.

---

### User Story 3 — Curadoria acelerada com sugestões ghost (Priority: P1)

DJ abre curadoria de uma faixa `/disco/[id]` (track row). Campos BPM,
tom e energia aparecem pré-preenchidos em cor ghost (cinza, placeholder-
style) com label "Spotify sugere". DJ confirma com Tab+Enter ou
altera o valor. Nenhum overwrite silencioso.

**Why this priority**: é o payoff da feature — o tempo economizado
em curadoria.

**Independent Test**: faixa com `spotify_bpm=120`, `tracks.bpm=null`:
input BPM aparece cinza com "120"; DJ aperta Tab → valor passa
pra tracks.bpm (autorado). Faixa com `tracks.bpm=118` E
`spotify_bpm=120`: input mostra "118" preto (autorado), sem
interferência do Spotify.

**Acceptance Scenarios**:

1. **Given** faixa com `tracks.bpm=null` e `spotify_bpm=120`,
   **When** DJ abre a tela de curadoria da faixa,
   **Then** input BPM aparece pré-populado com "120", em cor ghost
   cinza, com label "Spotify sugere" ao lado.
2. **Given** DJ aceita a sugestão,
   **When** pressiona Tab ou Enter no input,
   **Then** valor `120` é salvo em `tracks.bpm` (autorado). Input
   muda pra cor normal (preto). Label "Spotify sugere" some.
3. **Given** DJ discorda da sugestão,
   **When** digita `112` por cima de `120` e confirma,
   **Then** `tracks.bpm=112` é salvo. `spotify_bpm=120` permanece
   na coluna separada — não é tocado.
4. **Given** faixa com `tracks.bpm=118` já preenchido E
   `spotify_bpm=120`,
   **When** DJ abre curadoria,
   **Then** input mostra "118" em preto (valor autorado). Spotify
   suggestion NÃO é exibida — respeita Princípio I forte.
5. **Given** mesma lógica aplicada para `tracks.musicalKey` e
   `tracks.energy`,
   **When** DJ abre qualquer faixa,
   **Then** cada campo segue a regra: suggestion ghost se autoral
   null; valor autoral puro caso contrário.

---

### User Story 4 — Preview 30s inline (Priority: P2)

Em `/disco/[id]`, cada faixa que tem `spotify_preview_url` mostra um
botão `▶️` que toca 30 segundos da faixa sem sair do Sulco. Se preview
indisponível, botão vira link-out pra Spotify Web Player.

**Why this priority**: é alto valor de UX mas não bloqueante —
sem preview, a curadoria ainda funciona.

**Independent Test**: faixa com `spotify_preview_url` preenchido:
botão `▶️` aparece; clicar toca audio 30s; segundo clique pausa.
Faixa sem preview_url mas com `spotify_track_id`: botão vira
"Ouvir no Spotify" (link-out).

**Acceptance Scenarios**:

1. **Given** faixa com `spotify_preview_url` preenchido,
   **When** DJ clica `▶️`,
   **Then** áudio MP3 30s começa a tocar via `<audio>` nativo.
   Botão vira `⏸️` enquanto toca.
2. **Given** áudio tocando,
   **When** DJ clica `⏸️`,
   **Then** áudio pausa. Posição é preservada se clicar `▶️` de novo.
3. **Given** áudio tocando faixa A,
   **When** DJ clica `▶️` na faixa B,
   **Then** faixa A pausa automaticamente; faixa B começa do zero.
4. **Given** faixa com `spotify_track_id` mas `spotify_preview_url`
   null,
   **When** DJ olha a linha,
   **Then** botão mostra "→ Spotify" (link-out) em vez de `▶️`.
5. **Given** DJ clica "→ Spotify" link-out,
   **When** abre nova aba,
   **Then** `https://open.spotify.com/track/{id}` carrega com a
   faixa selecionada.

---

### User Story 5 — Corrigir match errado (Priority: P2)

DJ percebe que o match Spotify de um disco está errado (álbum
diferente, remaster trocado). Clica "Refazer match Spotify" em
`/disco/[id]`. Sulco limpa o match atual e abre o modal de candidatos
novamente.

**Why this priority**: realidade — matching fuzzy erra. Sem caminho
de correção, DJ fica travado.

**Independent Test**: disco com match errado (ex: comp vs original);
DJ clica "Refazer match", seleciona o correto nos candidatos, e
audio-features são re-buscados.

**Acceptance Scenarios**:

1. **Given** disco com `spotify_album_id` preenchido,
   **When** DJ abre `/disco/[id]`,
   **Then** vê botão "Refazer match Spotify" (opção extra além do
   "Buscar no Spotify" inicial).
2. **Given** DJ clica "Refazer match",
   **When** confirma em modal ("Isso vai limpar o match atual e as
   sugestões Spotify das faixas. Campos autorais preservados."),
   **Then** `spotify_album_id` e todos `spotify_track_id`,
   `spotify_bpm`, etc. são limpos; modal de busca Spotify reabre.
3. **Given** novo match selecionado,
   **When** confirmado,
   **Then** novos dados Spotify substituem os antigos. Campos
   autorais (`tracks.bpm` etc.) permanecem intactos.

---

### Edge Cases

- **Token Spotify expirou** (válido por 1h): Sulco usa refresh_token
  automaticamente. DJ nunca vê erro se o refresh token está válido
  (~60 dias). Se refresh falhar, mostra banner "Reconectar Spotify"
  em `/conta`.
- **Disco do Discogs que não existe no Spotify**: busca retorna 0
  candidatos; mensagem "Nenhum candidato". Nada impede o DJ de seguir
  a curadoria manual como sempre.
- **Remaster vs Original**: busca vai retornar os dois; DJ escolhe
  visualmente pela capa ou ano. Sulco não tenta adivinhar.
- **Faixa com versão estendida ou live**: `position+title` fuzzy pode
  não casar; faixa fica sem `spotify_track_id`. DJ pode linkar
  manualmente via modal "Escolher faixa Spotify" (escopo futuro) ou
  aceitar que essa faixa fica sem sugestão.
- **audio-features API retorna null ou 404**: faixa fica com
  `spotify_track_id` linkado mas `spotify_bpm` etc. null. Equivalente
  a "sem sugestão" na UI.
- **Preview_url null mas track tem ID**: muitas faixas (especialmente
  brasileiras e licenciamento regional) não têm preview disponível.
  UI fallback pra link-out (já coberto em US4).
- **DJ desconecta Spotify enquanto usa**: mid-operação, próxima call
  API falha com 401. Sulco mostra "Reconectar Spotify"; dados
  spotify_* existentes ficam no banco (úteis quando reconectar).
- **Spotify Rate limit (429)**: retry com backoff exponencial; se
  persistir, toast "Spotify ocupado — tente novamente em alguns
  minutos" sem quebrar o fluxo.
- **Dois DJs conectam Spotify ao mesmo time (multi-user)**: cada
  user tem seu próprio token em `users.spotify_token_encrypted`;
  isolamento total, sem cross-contamination.
- **User deletado** (via `/conta → Apagar conta` do 001): cascade via
  `ON DELETE CASCADE` herdado limpa tokens spotify_* em users e
  dados spotify_* em records e tracks. Nenhum revoke explícito na
  API Spotify; token fica inativo no lado deles até expirar.

## Requirements *(mandatory)*

### Functional Requirements

**Conexão e gestão de token:**

- **FR-001**: Cada user DEVE poder conectar sua conta Spotify em
  `/conta` via fluxo OAuth 2.0 PKCE (Authorization Code with PKCE).
- **FR-002**: Tokens Spotify (access_token + refresh_token) DEVEM
  ser cifrados com `MASTER_ENCRYPTION_KEY` antes de persistir no
  banco, mesmo padrão do PAT Discogs.
- **FR-003**: Access token tem validade ~1h; refresh_token DEVE ser
  usado automaticamente pra renovar sem intervenção do DJ.
- **FR-004**: Em `/conta`, DJ conectado DEVE ver seu display name
  Spotify + botão "Desconectar Spotify".
- **FR-005**: "Desconectar Spotify" DEVE limpar access_token,
  refresh_token e expires_at do user; dados spotify_* em records e
  tracks PERMANECEM (não são afetados pela desconexão).

**Matching de álbum (per-disco):**

- **FR-006**: Em `/disco/[id]`, DJ conectado no Spotify DEVE ver um
  botão "Buscar no Spotify" quando `spotify_album_id` for null no
  record.
- **FR-007**: Ao clicar, Sulco DEVE fazer search na API Spotify
  usando `artist + " " + title` como query; retornar top-3 albums
  com capa, artista, ano e número de faixas.
- **FR-008**: DJ escolhe 1 dos 3 candidatos; Sulco salva
  `spotify_album_id` em records e dispara busca de faixas + audio-features.
- **FR-009**: Quando `spotify_album_id` está preenchido, o botão vira
  "Refazer match Spotify" pra permitir correção.
- **FR-010**: "Refazer match" limpa `spotify_album_id`, todos os
  `spotify_track_id`, `spotify_bpm`, `spotify_key`, `spotify_energy`,
  `spotify_preview_url`, `spotify_updated_at` das tracks desse record.
  Reabre o modal de busca.

**Linkagem de faixas e audio-features:**

- **FR-011**: Após álbum casado, Sulco DEVE buscar
  `/v1/albums/{id}/tracks` e auto-linkar cada track Sulco a um track
  Spotify via `position + title` fuzzy match.
- **FR-012**: Pra tracks linkadas, Sulco DEVE buscar
  `/v1/audio-features?ids=...` em batches de até 100 tracks por
  call e salvar em colunas separadas `spotify_bpm`, `spotify_key`
  (convertido pra Camelot), `spotify_energy` (0-1 → 1-5),
  `spotify_preview_url` e `spotify_updated_at`.
- **FR-013**: Faixas que não linkaram (position não bate, título
  muito diferente, etc.) ficam sem `spotify_track_id` — aparecem
  sem sugestões na UI, sem erro.

**Curadoria com sugestões ghost:**

- **FR-014**: Na UI de curadoria de faixa (`/disco/[id]` track row),
  campos `bpm`, `musicalKey`, `energy`, se `tracks.{campo}` for null
  E `spotify_{campo}` existir, DEVEM ser pré-populados com o valor
  Spotify renderizado em estilo ghost (cor cinza, label "Spotify
  sugere") ao lado.
- **FR-015**: Ao DJ interagir com o input (digitar, Tab, Enter) o
  valor DEVE ser escrito em `tracks.{campo}` (autoral). Se o valor
  confirmado é igual ao sugerido, ainda é considerado autoral após
  a confirmação.
- **FR-016**: Se `tracks.{campo}` JÁ está preenchido (não-null) antes
  de qualquer interação, o input DEVE mostrar o valor autoral (em
  cor normal) e NÃO DEVE exibir a sugestão Spotify nem label. O
  valor autoral tem precedência absoluta (Princípio I).
- **FR-017**: Campos autorais fora do escopo deste spec — `moods`,
  `contexts`, `fineGenre`, `comment`, `references`, `isBomb`,
  `rating` — NÃO DEVEM ser nem lidos nem escritos pelo código do
  Spotify.

**Preview de áudio:**

- **FR-018**: Em cada linha de faixa em `/disco/[id]`, se
  `spotify_preview_url` existir, DEVE aparecer botão `▶️` que toca
  30s do MP3 via `<audio>` nativo do browser.
- **FR-019**: Somente 1 preview pode tocar por vez na tela; clicar
  `▶️` em outra faixa pausa a atual e inicia a nova do zero.
- **FR-020**: Se `spotify_preview_url` é null mas `spotify_track_id`
  existe, o botão DEVE virar link-out "→ Spotify" que abre
  `https://open.spotify.com/track/{id}` em nova aba.
- **FR-021**: Se `spotify_track_id` é null (faixa sem match), nenhum
  botão de preview aparece.

**Robustez e operação:**

- **FR-022**: Se access_token expirou durante uma call, Sulco DEVE
  tentar refresh antes de reportar erro. Se refresh falha (token
  revogado, etc.), marcar user como disconectado e mostrar banner
  "Reconectar Spotify" em `/conta`.
- **FR-023**: Rate limit 429 da Spotify DEVE ser tratado com retry
  backoff exponencial (máx 3 tentativas). Se persistir, mensagem
  pro DJ sem bloquear outras ações.
- **FR-024**: Dados spotify_* DEVEM ser escopo-por-user — busca
  no Spotify usa o token do user atual; não há acesso cruzado.

### Key Entities

- **users** (existente): ganha 3 colunas novas —
  `spotify_access_token_encrypted`, `spotify_refresh_token_encrypted`,
  `spotify_expires_at`. Todas null quando desconectado.
- **records** (existente): ganha 1 coluna nova —
  `spotify_album_id` (text, null quando sem match).
- **tracks** (existente): ganha 5 colunas novas —
  `spotify_track_id`, `spotify_bpm`, `spotify_key`
  (notação Camelot, mesmo formato de `tracks.musicalKey`),
  `spotify_energy` (integer 1-5), `spotify_preview_url`,
  `spotify_updated_at`.
- **Spotify Album Candidate** (conceito UI, não persiste): id, nome,
  artista, ano, cover_url, track_count. 3 por busca.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das conexões OAuth Spotify bem-sucedidas resultam
  em token cifrado salvo + display name visível em `/conta` em
  menos de 10s do retorno do redirect.
- **SC-002**: Em 10 discos mainstream bem conhecidos (top global
  artists), ≥80% têm match Spotify encontrado nos top-3 candidatos.
  Medido por uma amostra manual pós-deploy.
- **SC-003**: Após match, ≥80% das faixas do álbum recebem
  `spotify_track_id` linkado via fuzzy `position+title`. Medido em
  amostra de 10 álbuns.
- **SC-004**: Pra faixas com match, DJ consegue curar (confirmar
  BPM/tom/energia sugeridos) em **15 segundos** — redução de ~85%
  vs. ~90s manual. Medido em 20 faixas curadas após o deploy.
- **SC-005**: Zero incidentes de sobrescrita em `tracks.bpm`,
  `tracks.musicalKey`, `tracks.energy`, moods, contexts, fineGenre,
  comment, references, isBomb, rating. Validação em duas camadas:
  (a) **integration test** específico verificando que o guard
  if-null do applyAudioFeatures NÃO altera tracks.bpm quando já
  preenchido, e (b) **validação manual** via quickstart.md —
  comparar `SELECT bpm, musical_key, energy FROM tracks WHERE
  record_id=X` antes e depois de uma sessão de uso da feature.
- **SC-006**: Preview 30s começa a tocar em ≤500ms do clique,
  quando `spotify_preview_url` existe.
- **SC-007**: Token refresh ocorre transparente — DJ consegue ficar
  uma semana sem relogar no Spotify, com sessão ativa durante.
- **SC-008**: Zero vazamento de dados Spotify entre contas — user
  A não vê dados spotify_* do user B em nenhuma tela
  (regressão de isolamento do 002).

## Assumptions

- Spotify Developer Mode (free) é suficiente pra desenvolvimento +
  produção do piloto. Sem custo de API.
- Rate limit de ~180 req/min do Spotify é suficiente pro uso
  interativo do DJ (não batch); raro atingir.
- `preview_url` estar disponível depende de licenciamento regional
  do Spotify; pra catálogo brasileiro, taxa de disponibilidade
  fica entre 60-80% (baseado em uso observado).
- A conversão pitch class + mode → Camelot é determinística; fórmulas
  públicas documentam.
- Conversão `energy` Spotify (0-1 float) pra Sulco (1-5 integer) usa
  bucket direto: ≤0.2=1, ≤0.4=2, ≤0.6=3, ≤0.8=4, >0.8=5.
- Matching fuzzy `position + title`: "A1" vs "1", "B2" vs "2" — já
  normalizamos em 003 (compareTrackPositions) e reusamos aqui.
- DJ pode ter Spotify free ou Premium; preview 30s funciona igual em
  ambos (é MP3 público via CDN, não requer sessão Web Playback SDK).
- Esta feature é puramente OPT-IN: DJ nunca é forçado a conectar
  Spotify. Sem conexão, o Sulco funciona exatamente como antes.

## Dependencies

- **Spotify Web API** (grátis, developer.spotify.com): endpoints
  `/search`, `/albums/{id}/tracks`, `/audio-features`, `/me`.
- **Schema migration** em `users`, `records` e `tracks` com as
  colunas novas — aplicada via `drizzle-kit push` (tabelas `records`
  e `tracks` têm dados, então ADD COLUMN default null é seguro).
- **Env vars** novas na Vercel: `SPOTIFY_CLIENT_ID`,
  `SPOTIFY_REDIRECT_URI`. PKCE não exige `SPOTIFY_CLIENT_SECRET`.
- **Nova rota Next.js**: `GET /api/spotify/callback` pra receber o
  code do OAuth e trocar por access_token.
- Princípio I (Constituição) — central no spec, não pode ser violado.

## Out of Scope (backlog registrado)

- **Matching em batch** (todos os discos de uma vez) — permanece
  manual per-disco como decidido em clarify 2026-04-24
- **Auto-match ao importar** / ao reimportar
- **Refresh automático de audio-features** (DJ pode manual via
  "Refazer match" se quiser atualizar)
- **Export de Set → Playlist Spotify** — escopo futuro (005 ou
  similar)
- **Import inverso** Spotify → Discogs
- **Web Playback SDK inline** (full track playback, requer Premium
  + SDK complicado) — fica pro backlog como incremento 005 ou 006
- **Edição manual do link de faixa Spotify** (ex: DJ cola URL
  quando position+title não casa) — pode virar incremento se virar
  dor; não é necessário no MVP
- **Busca livre no Spotify** (ex: DJ procura uma faixa pra linkar
  independente do disco) — fora do escopo
- **Mostrar sugestões moods/contexts baseadas em gêneros Spotify** —
  muito especulativo, fora do escopo

## Notas de implementação (referência para /speckit.plan)

- Módulo novo: `src/lib/spotify/` (client, oauth, matching,
  audio-features, key-to-camelot)
- Schema: adição de colunas em `users`, `records`, `tracks` (ver
  Key Entities)
- Env vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`
- Nova rota Next.js: `src/app/api/spotify/callback/route.ts`
- Novas Server Actions em `src/lib/actions.ts`:
  `connectSpotifyStart`, `disconnectSpotify`, `searchSpotifyAlbum`,
  `selectSpotifyAlbumMatch`, `refreshSpotifyMatch`
- Componentes novos:
  - `src/components/spotify-connect.tsx` (botão connect/disconnect em /conta)
  - `src/components/spotify-match-modal.tsx` (seleção top-3)
  - `src/components/spotify-preview-button.tsx` (▶️/⏸️ audio)
  - `src/components/bpm-input.tsx` (input com ghost hint) — ou
    refatorar input existente em track-curation-row
- Tabela existente `track_curation_row.tsx` refatorada pra consumir
  `spotify_*` fields + exibir ghost hints
