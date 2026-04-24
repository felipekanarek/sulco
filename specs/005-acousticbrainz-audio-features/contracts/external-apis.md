# Contratos — APIs externas

## MusicBrainz (MB)

**Base**: `https://musicbrainz.org/ws/2`
**User-Agent obrigatório**: `Sulco/0.1 ( marcus@infoprice.co )`
**Rate limit**: 1 req/s anonymous. Respeitar com `await sleep(1100)`
entre chamadas sequenciais.

### 1. Buscar release por Discogs ID

**Request**:
```
GET /release?query=discogs:{discogsReleaseId}&fmt=json&limit=3
```

**Response (simplificado)**:
```ts
type MBSearchResponse = {
  releases: Array<{
    id: string;          // MBID da release
    title: string;
    'artist-credit': Array<{ name: string }>;
    score: number;       // 0..100 confidence
  }>;
};
```

**Uso**: pegar `releases[0].id` se `releases[0].score >= 90`. Caso
score < 90 → tratar como "não resolvido" e marcar `syncedAt` sem
escrever `mbid`.

### 2. Fetch release com recordings

**Request**:
```
GET /release/{mbReleaseId}?inc=recordings&fmt=json
```

**Response (simplificado)**:
```ts
type MBRelease = {
  id: string;
  title: string;
  media: Array<{
    position: number;  // 1-based medium index (disco A/B → 1/2)
    tracks: Array<{
      id: string;          // MBID da track (NÃO é o MBID da recording)
      number: string;      // posição dentro do medium (ex. "1", "2")
      position: number;
      title: string;
      recording: {
        id: string;        // ← MBID da recording (o que queremos)
        title: string;
      };
    }>;
  }>;
};
```

**Uso**: flatten `media[].tracks[]`, matar duplicados, casar com
`tracks.position` do Sulco via `compareTrackPositions` (reuso de 003).
Extrair `recording.id` pra persistir em `tracks.mbid`.

### 3. Erros esperados

- `503 Service Unavailable` (rate limited) → sleep 2× e retry 1×.
  Se falhar de novo, abortar a faixa/release e deixar pro próximo cron.
- `404 Not Found` → faixa não tem MBID. `audioFeaturesSyncedAt =
  now`, `mbid = NULL`.
- Timeout 10s → tratar como 503.

---

## AcousticBrainz (AB)

**Base**: `https://acousticbrainz.org/api/v1`
**User-Agent**: `Sulco/0.1 ( marcus@infoprice.co )`
**Rate limit**: não documentado. Respeitar ~2 req/s.
**Estado**: read-only desde 2022 (sem novas submissões, data existente
servida normalmente).

### 1. Low-level features

**Request**:
```
GET /{mbid}/low-level
```

**Response (subset que usamos)**:
```ts
type ABLowLevel = {
  rhythm: {
    bpm: number;                  // float, ex. 120.3
  };
  tonal: {
    key_key: string;              // 'C', 'C#', 'Db', 'D', ..., 'B'
    key_scale: 'major' | 'minor';
  };
};
```

**Uso**:
- `bpm` → `Math.round(rhythm.bpm)`.
- `musicalKey` → `camelot(key_key, key_scale)` (ver `src/lib/acousticbrainz/camelot.ts`).

### 2. High-level features

**Request**:
```
GET /{mbid}/high-level
```

**Response (subset)**:
```ts
type ABHighLevel = {
  highlevel: {
    mood_acoustic:   { probability: number; value: string };
    mood_aggressive: { probability: number; value: string };
    mood_electronic: { probability: number; value: string };
    mood_happy:      { probability: number; value: string };
    mood_party:      { probability: number; value: string };
    mood_relaxed:    { probability: number; value: string };
    mood_sad:        { probability: number; value: string };
    danceability:    { probability: number; value: string };  // ignorado
    tonal_atonal:    { probability: number; value: string };  // ignorado
  };
};
```

**Uso**:
- `energy` (1..5) → a partir de `mood_aggressive.probability` mapeado
  `[0..1] → [1..5]` via `Math.max(1, Math.ceil(p * 5))`.
- `moods` → filtrar os 7 mood_* (exceto danceability/tonal_atonal),
  pegar os com `probability >= 0.7` quando `value === 'happy'` (ou
  equivalente nome sem prefixo). Remover prefixo `mood_` → array de
  strings.

### 3. Erros esperados

- `404 Not Found` → MBID não tem audio features indexadas. Normal.
  `audioFeaturesSyncedAt = now`, source continua `NULL`.
- `503` → retry 1× após sleep.
- Timeout 10s → tratar como 503.

---

## Discogs (já usado em sync)

**Não altera contrato existente**. A cadeia Discogs → MB → AB parte de
`records.discogsId` que já está persistido. Não pedimos nada novo
ao Discogs nessa feature.
