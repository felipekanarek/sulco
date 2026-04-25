import 'server-only';

// Cliente MusicBrainz. Ponte de resolução Discogs → MBID de recording.
// Rate limit 1 req/s com User-Agent identificado.
// Ver specs/005-acousticbrainz-audio-features/contracts/external-apis.md.

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Sulco/0.1 ( marcus@infoprice.co )';
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_GAP_MS = 1_100;
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

type MBUrlLookupResponse = {
  id?: string;
  relations?: Array<{
    type?: string;
    'target-type'?: string;
    release?: { id?: string; title?: string };
  }>;
};

/**
 * Resolve o MBID da release MusicBrainz equivalente à release Discogs.
 *
 * **Implementação**: consulta o endpoint `/url?resource=<discogs-url>`
 * do MusicBrainz, que retorna a entidade URL do Discogs registrada no MB
 * junto com as relações (inclusive `discogs` release-rels). Isso é o
 * canonical lookup pra "dado este Discogs ID, qual MBID?" — o LHS da
 * relação é o Discogs URL, o RHS é a release MB. Ver:
 * https://musicbrainz.org/doc/MusicBrainz_API#url
 *
 * NÃO usamos `/release?query=discogs:{id}`: esse query Lucene não
 * indexa o field `discogs` como filtro (`discogs` vira keyword no
 * body search) e retorna centenas de garbage matches score=100.
 *
 * Retorna `null` se a URL Discogs não tem entry no MB ou se nenhuma
 * relação `discogs`→release existe.
 */
export async function searchReleaseByDiscogsId(discogsReleaseId: number): Promise<string | null> {
  await rateLimit();
  const discogsUrl = `https://www.discogs.com/release/${discogsReleaseId}`;
  const url = `${MB_BASE}/url?resource=${encodeURIComponent(discogsUrl)}&inc=release-rels&fmt=json`;
  let res = await fetchWithTimeout(url);
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 2_200));
    await rateLimit();
    res = await fetchWithTimeout(url);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`MB url lookup failed: ${res.status}`);
  }
  const body = (await res.json()) as MBUrlLookupResponse;
  const release = body.relations?.find(
    (r) => r.type === 'discogs' && r.release?.id,
  )?.release;
  return release?.id ?? null;
}

type MBReleaseSearchResponse = {
  releases?: Array<{
    id: string;
    score?: number;
    title?: string;
    'track-count'?: number;
    'artist-credit'?: Array<{ name?: string }>;
  }>;
};

/**
 * Normaliza string de artist/title pra comparação tolerante:
 *  - lowercase
 *  - remove pontuação comum
 *  - remove "the " no início
 *  - colapsa whitespace
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''"`.,!?():;\[\]–—-]/g, ' ')
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fallback search por artist+title quando URL lookup falha (release
 * Discogs não está mapeada no MB). Comum pra prensagens nacionais
 * de discos internacionais (ex: edição BR de Michael Jackson Dangerous).
 *
 * Validações antes de aceitar:
 *  - score >= 95 (alta confiança Lucene)
 *  - artist do MB casa com `artist` Sulco (após normalize)
 *  - se `expectedTrackCount` informado: prefere release com track-count
 *    igual; se nenhuma bate, aceita o melhor score
 *
 * Retorna `null` se nenhum resultado passar os filtros.
 */
export async function searchReleaseByArtistAndTitle(
  artist: string,
  title: string,
  expectedTrackCount?: number,
): Promise<string | null> {
  await rateLimit();
  const escapeLucene = (s: string) => s.replace(/["\\]/g, ' ').trim();
  const q = `artist:"${escapeLucene(artist)}" AND release:"${escapeLucene(title)}"`;
  const url = `${MB_BASE}/release?query=${encodeURIComponent(q)}&fmt=json&limit=10`;

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
  const body = (await res.json()) as MBReleaseSearchResponse;
  const candidates = (body.releases ?? []).filter((r) => {
    if (typeof r.score === 'number' && r.score < 95) return false;
    const mbArtist = r['artist-credit']?.[0]?.name ?? '';
    return normalizeForMatch(mbArtist) === normalizeForMatch(artist);
  });
  if (candidates.length === 0) return null;

  // Se tem expected track count, prefere release com track-count que casa
  if (typeof expectedTrackCount === 'number' && expectedTrackCount > 0) {
    const exact = candidates.find((r) => r['track-count'] === expectedTrackCount);
    if (exact) return exact.id;
  }
  // Senão, primeiro (já vem ordenado por score)
  return candidates[0].id;
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
