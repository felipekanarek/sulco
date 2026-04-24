import 'server-only';

// Cliente MusicBrainz. Ponte de resolução Discogs → MBID de recording.
// Rate limit 1 req/s com User-Agent identificado.
// Ver specs/005-acousticbrainz-audio-features/contracts/external-apis.md.

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Sulco/0.1 ( marcus@infoprice.co )';
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_GAP_MS = 1_100;
const MIN_RELEASE_SCORE = 90;

let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_GAP_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_GAP_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

type MBSearchResponse = {
  releases?: Array<{
    id: string;
    score?: number;
    title?: string;
  }>;
};

/**
 * Busca o MBID da release em MusicBrainz correspondente ao Discogs
 * release ID. Retorna `null` se não achou ou se score < MIN_RELEASE_SCORE.
 *
 * Lança `Error` em 503 persistente ou timeout (caller decide retry).
 */
export async function searchReleaseByDiscogsId(discogsReleaseId: number): Promise<string | null> {
  await rateLimit();
  const url = `${MB_BASE}/release?query=${encodeURIComponent(`discogs:${discogsReleaseId}`)}&fmt=json&limit=3`;
  let res = await fetchWithTimeout(url);
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 2_200));
    await rateLimit();
    res = await fetchWithTimeout(url);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`MB search failed: ${res.status}`);
  }
  const body = (await res.json()) as MBSearchResponse;
  const first = body.releases?.[0];
  if (!first) return null;
  if (typeof first.score === 'number' && first.score < MIN_RELEASE_SCORE) return null;
  return first.id;
}

type MBReleaseFetchResponse = {
  media?: Array<{
    position?: number;
    'track-count'?: number;
    tracks?: Array<{
      id?: string;
      number?: string;
      position?: number;
      title?: string;
      recording?: {
        id?: string;
        title?: string;
      };
    }>;
  }>;
};

export type MBRecordingRef = {
  /** Posição como string pra match direto com tracks.position (ex: "A1", "B3" ou "1"/"2"). */
  position: string;
  title: string;
  recordingMbid: string;
};

/**
 * Busca detalhes da release MB com recordings embutidos. Retorna
 * array flat de recordings ordenado pela posição original.
 *
 * A posição retornada é a string `track.number` do MB. Pra vinil isso
 * normalmente já vem como "A1", "B2" etc; pra CD vem como "1", "2" etc.
 * O matching com `tracks.position` do Sulco usa `compareTrackPositions`
 * que já lida com ambos os formatos.
 */
export async function fetchReleaseRecordings(mbReleaseId: string): Promise<MBRecordingRef[]> {
  await rateLimit();
  const url = `${MB_BASE}/release/${encodeURIComponent(mbReleaseId)}?inc=recordings&fmt=json`;
  let res = await fetchWithTimeout(url);
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 2_200));
    await rateLimit();
    res = await fetchWithTimeout(url);
  }
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`MB release fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as MBReleaseFetchResponse;
  const refs: MBRecordingRef[] = [];
  for (const medium of body.media ?? []) {
    for (const track of medium.tracks ?? []) {
      const recordingMbid = track.recording?.id;
      const position = track.number;
      const title = track.title ?? track.recording?.title ?? '';
      if (!recordingMbid || !position) continue;
      refs.push({ position, title, recordingMbid });
    }
  }
  return refs;
}
