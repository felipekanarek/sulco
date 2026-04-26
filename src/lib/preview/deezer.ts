import 'server-only';

// 008 — cliente da Deezer Search API.
// Server-only: roda no Vercel (IP do server, não do DJ).

const DEEZER_SEARCH_URL = 'https://api.deezer.com/search';
const USER_AGENT = 'Sulco/0.1 ( marcus@infoprice.co )';
const TIMEOUT_MS = 8000;

export type DeezerSearchHit = {
  previewUrl: string | null;
  matchedTitle: string;
  matchedArtist: string;
};

type DeezerApiResponse = {
  data: Array<{
    id: number;
    title: string;
    preview: string;
    duration: number;
    artist: { id: number; name: string };
    album: { id: number; title: string };
  }>;
  total: number;
  next?: string;
};

export class DeezerServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'DeezerServiceError';
  }
}

/**
 * Busca o 1º hit da Deezer Search API por `<artist> <title>`.
 * Retorna `null` quando `data: []` (sem hit).
 * Retorna hit com `previewUrl: null` quando hit existe mas `preview === ''`.
 * Throw `DeezerServiceError` em 5xx ou timeout — caller decide retry.
 */
export async function searchTrackPreview(
  artist: string,
  title: string,
): Promise<DeezerSearchHit | null> {
  const query = `${artist} ${title}`.trim();
  const url = `${DEEZER_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    throw new DeezerServiceError(`Deezer indisponível: ${message}`);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    throw new DeezerServiceError(`Deezer retornou ${res.status}`, res.status);
  }

  let body: DeezerApiResponse;
  try {
    body = (await res.json()) as DeezerApiResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DeezerServiceError(`Deezer JSON inválido: ${message}`);
  }

  if (!body.data || body.data.length === 0) {
    return null;
  }

  const hit = body.data[0];
  return {
    previewUrl: hit.preview && hit.preview.length > 0 ? hit.preview : null,
    matchedTitle: hit.title,
    matchedArtist: hit.artist?.name ?? '',
  };
}
