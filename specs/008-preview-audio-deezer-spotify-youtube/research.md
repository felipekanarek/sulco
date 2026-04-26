# Phase 0 — Research: Preview de áudio (008)

**Data**: 2026-04-26
**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Decisões fundamentadas com testes empíricos contra Deezer Search API
em 2026-04-26 (resultados anexados).

---

## 1. Cliente Deezer Search

**Decisão**: Endpoint `GET https://api.deezer.com/search?q=<query>&limit=1`,
sem auth. Query é `artist + " " + title` URL-encoded (URLSearchParams).
Limit=1 retorna apenas o primeiro hit; suficiente pra MVP.

**Resposta** (formato real validado):
```json
{
  "data": [{
    "id": 12345,
    "title": "Before Destruction",
    "preview": "https://cdnt-preview.dzcdn.net/api/1/1/.../snippet.mp3",
    "duration": 197,
    "artist": { "name": "Spoon", "id": ... },
    "album": { "title": "Transference", "id": ... }
  }],
  "total": 1
}
```

`preview` pode ser **string vazia** quando track existe mas não tem
preview (raro). `data: []` quando nenhuma faixa casa.

**Rate limit & bot mitigation**:
- Deezer não documenta rate limit explícito pra Search.
- Header `set-cookie: _abck=...; bm_sz=...` sugere Akamai bot
  mitigation. Comportamento esperado: User-Agent identificado +
  ritmo gentil evita escalada.
- **Sleep defensivo de 500ms entre calls** sequenciais (caso o futuro
  user clique em ▶ rápido em várias faixas seguidas).
- Em produção real (resolução lazy 1-por-DJ-action), Deezer recebe
  poucos requests/dia — bot mitigation não deve disparar.

**User-Agent**: `Sulco/0.1 ( marcus@infoprice.co )` (idêntico ao 005).

**Alternativas consideradas**:
- *Deezer Album/Track endpoints diretos* (`/album/{id}`, `/track/{id}`):
  precisariam de IDs Deezer pré-resolvidos. Sem fonte canônica
  Discogs→Deezer mapeada, search continua sendo o caminho. Rejeitado.
- *Deezer OAuth pra full-length playback*: fora de escopo (decidido
  no roadmap; replicaria complexidade do Spotify SDK arquivado).

---

## 2. Match strategy (escolhido em /speckit.specify)

**Decisão**: `query = "<records.artist> <tracks.title>"`. Sem normalização
agressiva (ex: strip "feat.", "(remix)", etc) na 1ª iteração.

**Empirical**:
- Spoon — Before Destruction → match perfeito, preview ✅
- Caetano Veloso — Pulsar → match perfeito, preview ✅
- Honey B (vinil obscuro brasileiro) → 0 hits → cache marker
  "indisponível", link-outs cobrem

**Rationale**: simplicidade > completude. Falsos matches (mesma
string em faixas diferentes) são raros e DJ identifica auditivamente
em 30s. Spotify/YouTube link-out cobrem casos onde Deezer falha.

**Alternativas**:
- *Match por ISRC*: Sulco não persiste ISRC (decisão 005). Não
  viável sem reabrir aquele escopo. Rejeitado.
- *Match com fallback artist+album+title*: aumentaria precisão mas
  adiciona complexidade. Pode entrar em iteração 2 se falsos matches
  virarem problema observável.
- *Normalização agressiva da query*: idem — só se observado o
  problema na prática.

---

## 3. Estado "1 player por vez" — React Context vs alternativas

**Decisão**: React Context `<PreviewPlayerProvider>` no layout raiz.
Expõe `currentTrackId: number | null` + `setCurrent: (id) => void`.
Cada `<PreviewControls>` consome via hook `usePreviewPlayer()`.
Quando um component começa a tocar, chama `setCurrent(myId)`. Um
useEffect em cada componente compara `currentTrackId !== myId` e
pausa o `<audio>` local.

**Rationale**:
- Constituição proíbe Zustand/Redux (II).
- Context é a primitiva nativa do React pra estado global cliente.
- Volume "1 player ativo" é trivialmente baixo (1 inteiro) — Context
  não causa re-render storm.

**Alternativas**:
- *CustomEvent global* (`window.dispatchEvent`): funciona mas pior
  pro debug, type-safety zero, side effects implícitos. Rejeitado.
- *Ref global em singleton `let activeAudio: HTMLAudioElement`*:
  funciona até hot-reload no dev. Frágil. Rejeitado.

---

## 4. Cancelamento de request (race entre clicks)

**Decisão**: Server Action `resolveTrackPreview` continua executando
no servidor mesmo se cliente abortar — Vercel não suporta abort
mid-Server Action. Mas o **cliente** usa `AbortController` pra
descartar a resposta da action anterior se nova foi disparada.

**Implementação**:
```ts
const abortRef = useRef<AbortController | null>(null);

async function play() {
  abortRef.current?.abort(); // aborta resposta anterior
  abortRef.current = new AbortController();
  const signal = abortRef.current.signal;
  const res = await resolveTrackPreview({ trackId });
  if (signal.aborted) return; // ignorar resposta velha
  // ... toca
}
```

A Server Action ainda executa no servidor (uma chamada Deezer extra,
talvez), mas é absorvida — cache é coerente. UX fica consistente.

---

## 5. Estados visuais do botão Deezer

**Decisão** (vinda do /speckit.clarify Q3): 4 estados:

| Estado | Visual | Disabled? |
|---|---|---|
| Idle | ▶ | não |
| Loading | ⟳ animado (ou ●●●) | sim |
| Playing | ⏸ | não |
| Erro/Indisponível | ▶ + texto "indisponível" + botão "tentar de novo" | botão Deezer disabled, "tentar de novo" ativo |

Implementação: discriminated union state local:
```ts
type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'playing' }
  | { kind: 'unavailable'; reason: 'no-deezer' | 'load-error' };
```

---

## 6. URL templates Spotify e YouTube (FR-008/009)

**Decisão**: URLs determinísticas geradas client-side a partir de
`artist` + `title`. Server Action **não** retorna esses URLs (são
puros e o cliente já tem os dados). Só retorna o que muda
(deezerUrl).

```ts
function spotifySearchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}
function youtubeSearchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`;
}
```

Encoding via `encodeURIComponent` cobre acentos pt-BR (Caetano Veloso),
caracteres especiais (`'`, `&`), e japonês/símbolos. Spotify aceita
` ` como `%20`; YouTube aceita ambos `%20` e `+` (URLSearchParams
gera `+` se quiser uniformizar — irrelevante na prática).

**Edge case**: artist com aspas duplas (`"`) — `encodeURIComponent`
encoda. OK pra ambos endpoints (testado mentalmente; sem caso
patológico no acervo).

---

## 7. Cache invalidation strategy

**Decisão** (vinda do /speckit.clarify Q2): invalidação reativa
manual via Server Action `invalidateTrackPreview(trackId)` que reseta
`previewUrl=NULL, previewUrlCachedAt=NULL`. Cliente chama esta action
antes de re-disparar `resolveTrackPreview`.

Sem TTL automático na 1ª iteração. Argumento: Deezer normalmente
mantém URLs por meses; URL morta é exceção. TTL automático adiciona
complexidade (decidir N dias, scheduler, lock por race com play
em andamento).

**Iteração 2 (futuro)**: se telemetria mostrar cache miss recorrente
do mesmo trackId em <30 dias, considerar TTL automático.

---

## 8. Schema delta strategy

**Decisão**: 2 colunas aditivas em `tracks`:
- `previewUrl TEXT NULL` — URL Deezer ou string vazia (marker
  "indisponível") ou NULL (nunca tentado)
- `previewUrlCachedAt INTEGER NULL` — timestamp da última tentativa

Aplicação:
1. Dev: `npm run db:push` (Drizzle ORM detecta + ALTER automático)
2. Prod: ALTER manual via Turso CLI (mesmo padrão 005 — `db:push`
   tem warnings interativos com drift de 002, evitar)

Sem backfill — todas as rows iniciam com NULL/NULL (estado "nunca
tentado").

**Reuso do índice 005**: existe `tracks_af_backlog_idx` em
`(audio_features_source, audio_features_synced_at)`. Não preciso
de novo índice pra preview (acesso é sempre por `tracks.id`, já
indexed PK).

---

## 9. Privacidade

**Decisão**: requests Deezer saem do server Vercel (IP do server,
não do DJ). Spotify/YouTube link-outs abrem no browser do DJ — IP
dele vai pra eles, mas isso é o normal de qualquer link aberto.

**Nada novo a registrar em privacy policy** (não há). Comportamento
equivalente ao 005 (server bate em MB/AB).

---

## Unknowns resolvidos

✅ Cliente Deezer Search (endpoint, response format, rate limit)
✅ Match strategy (artist + title, sem normalização agressiva)
✅ Estado "1 player por vez" (React Context)
✅ Cancelamento de request (AbortController client-side)
✅ Estados visuais do botão (discriminated union de 4 estados)
✅ URL templates Spotify/YouTube (client-side, encodeURIComponent)
✅ Cache invalidation (reativa manual, sem TTL na 1ª iteração)
✅ Schema delta (2 colunas aditivas, ALTER manual em prod)
✅ Privacidade (servidor → Deezer; DJ → Spotify/YouTube)

Nenhum NEEDS CLARIFICATION remanescente pra Phase 1.
