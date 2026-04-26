# Contratos — Server Actions e API interna

## Server Actions

### `resolveTrackPreview(input)`

Resolve preview Deezer pra uma track, com cache.

```ts
type ResolveTrackPreviewInput = { trackId: number };

type ResolveTrackPreviewResult =
  | {
      ok: true;
      data: {
        deezerUrl: string | null;        // null = sem preview
        cached: boolean;                  // true se veio do DB sem chamar Deezer
      };
    }
  | { ok: false; error: string };

export async function resolveTrackPreview(
  input: ResolveTrackPreviewInput,
): Promise<ResolveTrackPreviewResult>;
```

**Pseudo-fluxo**:

```
1. requireCurrentUser() → user
2. Validar input via Zod
3. Buscar track + record JOIN (trackId, records.userId = user.id)
4. Se ownership falha: { ok: false, error: 'Faixa não encontrada' }
5. Se track.previewUrlCachedAt != null:
     // cache hit (URL ou marker '')
     deezerUrl = track.previewUrl || null  // '' vira null
     return { ok: true, data: { deezerUrl, cached: true } }
6. Cache miss → searchTrackPreview(record.artist, track.title)
7. Persistir resultado (UPDATE tracks SET preview_url=?, preview_url_cached_at=now)
   - Match com preview: previewUrl = URL
   - Match sem preview ou sem hit: previewUrl = ''
8. Em erro de network: NÃO persiste cache, retorna { ok: false }
9. return { ok: true, data: { deezerUrl, cached: false } }
```

**Importante**:
- Não toca em campos AUTHOR (Princípio I)
- Não toca em `audio_features_*` (zona 005)
- Server-side: `import 'server-only'` em `src/lib/preview/deezer.ts`

---

### `invalidateTrackPreview(input)`

Reseta cache pra forçar nova busca Deezer no próximo `resolveTrackPreview`.

```ts
type InvalidateTrackPreviewInput = { trackId: number };

type InvalidateTrackPreviewResult =
  | { ok: true }
  | { ok: false; error: string };

export async function invalidateTrackPreview(
  input: InvalidateTrackPreviewInput,
): Promise<InvalidateTrackPreviewResult>;
```

**Pseudo-fluxo**:

```
1. requireCurrentUser() + ownership check
2. UPDATE tracks
   SET preview_url = NULL, preview_url_cached_at = NULL
   WHERE id = ?
3. revalidatePath('/disco/[id]') — opcional pra forçar RSC re-render
4. return { ok: true }
```

Cliente chama esta action **antes** de re-disparar `resolveTrackPreview`.
Geralmente combinado com botão "tentar de novo" na UI.

---

## Funções internas (`src/lib/preview/`)

### `searchTrackPreview(artist, title)` — `deezer.ts`

```ts
import 'server-only';

type DeezerSearchHit = {
  previewUrl: string | null;  // null se data[0].preview === ''
  matchedTitle: string;
  matchedArtist: string;
};

export async function searchTrackPreview(
  artist: string,
  title: string,
): Promise<DeezerSearchHit | null>;
```

- `null` quando `data: []` (sem hit)
- `previewUrl: null` quando hit existe mas `preview` é string vazia
- Throw em 503 ou timeout (caller decide retry)

Implementação: fetch direto, sem rate limit interno (DJ chama 1x
por click manual; volume baixo).

### `spotifySearchUrl(artist, title)` — `urls.ts`

```ts
export function spotifySearchUrl(artist: string, title: string): string;
```

Retorna `https://open.spotify.com/search/<encoded>`.

### `youtubeSearchUrl(artist, title)` — `urls.ts`

```ts
export function youtubeSearchUrl(artist: string, title: string): string;
```

Retorna `https://www.youtube.com/results?search_query=<encoded>`.

Ambos puros, sem side effects, **client-safe**: NÃO marcar `urls.ts`
como `server-only`. Cliente importa direto.

---

## Componentes (UI)

### `<PreviewControls />`

Client component em `src/components/preview-controls.tsx`.

```tsx
type PreviewControlsProps = {
  trackId: number;
  artist: string;          // record.artist
  title: string;           // track.title
  initialPreviewUrl: string | null;  // null=nunca tentou; ''=sem dado; URL=cacheado
  initialCachedAt: Date | null;      // pra distinguir null vs ''
};

export function PreviewControls(props: PreviewControlsProps): JSX.Element;
```

Renderiza linha horizontal:
```
[▶/⏸/⟳] [↗ Spotify] [↗ YouTube]
```

Estados internos via discriminated union (research §5).

### `<PreviewPlayerProvider />`

Client component em `src/components/preview-player-context.tsx`.

```tsx
type Ctx = {
  currentTrackId: number | null;
  setCurrent: (id: number | null) => void;
};

export const PreviewPlayerContext: React.Context<Ctx>;
export function PreviewPlayerProvider({ children }: { children: ReactNode }): JSX.Element;
export function usePreviewPlayer(): Ctx;
```

Wrapper inserido em `src/app/layout.tsx` envolvendo `{children}`.
Cada `<PreviewControls>` faz `useEffect` que pausa quando
`currentTrackId !== myTrackId`.

---

## Server Action interaction patterns

### Click 1ª vez (cache miss)

```
[Cliente] click ▶
  ↓
[Cliente] setState(loading)
  ↓
[Cliente] resolveTrackPreview({ trackId })
  ↓ (Server Action)
[Server] searchTrackPreview → Deezer API → URL ou null
[Server] UPDATE tracks SET previewUrl=..., previewUrlCachedAt=now()
  ↓
[Cliente] receive { ok: true, data: { deezerUrl, cached: false } }
  ↓
[Cliente] se deezerUrl: <audio src=...> + play() + setState(playing)
[Cliente] se null: setState({ unavailable: 'no-deezer' })
```

### Click subsequente (cache hit)

```
[Cliente] click ▶
  ↓
[Cliente] resolveTrackPreview → cache hit (cached: true)
  ↓
[Cliente] receive deezerUrl
  ↓
[Cliente] play (sem chamada Deezer)
```

### Erro de áudio (URL morta)

```
[Audio] onerror dispara
  ↓
[Cliente] setState({ unavailable: 'load-error' })
  ↓
[Cliente] mostra "Preview indisponível" + botão "tentar de novo"
  ↓
[Cliente] click "tentar de novo"
  ↓
[Cliente] invalidateTrackPreview → reset cache
  ↓
[Cliente] resolveTrackPreview → busca Deezer novamente → retorna URL fresca
  ↓
[Cliente] play
```

### Race entre clicks rápidos

```
[Cliente] click track A → resolveTrackPreview start (~3s)
[Cliente] click track B → abortController.abort() do A
                        → resolveTrackPreview B start
[Server] A continua executando (Deezer 1 chamada extra) — absorvido
[Cliente] resposta de A chega → ignorada (signal aborted)
[Cliente] resposta de B chega → toca B
```

Server-side state continua coerente (cache de A é gravado mesmo se
cliente ignorar).
