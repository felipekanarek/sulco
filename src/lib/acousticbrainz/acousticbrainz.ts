import 'server-only';

// Cliente AcousticBrainz. Busca audio features por MBID.
// Dataset congelado em 2022 mas servido em read-only.
// Ver specs/005-acousticbrainz-audio-features/contracts/external-apis.md.

import { toCamelot } from './camelot';
import { deriveEnergy } from './energy';
import { selectMoods, type ABHighLevel } from './moods';

const AB_BASE = 'https://acousticbrainz.org/api/v1';
const USER_AGENT = 'Sulco/0.1 ( marcus@infoprice.co )';
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_GAP_MS = 500;

let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_GAP_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_GAP_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

type ABLowLevel = {
  rhythm?: { bpm?: number };
  tonal?: { key_key?: string; key_scale?: 'major' | 'minor' };
};

type ABHighLevelResponse = {
  highlevel?: ABHighLevel;
};

export type AudioFeatures = {
  bpm: number | null;
  camelot: string | null;
  energy: number | null;
  moods: string[];
};

async function fetchJsonOr404<T>(url: string): Promise<T | null> {
  await rateLimit();
  let res = await fetchWithTimeout(url);
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 2_000));
    await rateLimit();
    res = await fetchWithTimeout(url);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`AB fetch failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Busca audio features (bpm, camelot, energy, moods) pelo MBID da
 * recording. Retorna `null` se AB não tem dados pro MBID.
 *
 * Faz 2 requests em sequência (low-level + high-level) — se o primeiro
 * retorna 404, retorna null sem chamar o segundo (economiza rate).
 */
export async function fetchAudioFeatures(mbid: string): Promise<AudioFeatures | null> {
  const low = await fetchJsonOr404<ABLowLevel>(`${AB_BASE}/${encodeURIComponent(mbid)}/low-level`);
  if (!low) return null;

  const high = await fetchJsonOr404<ABHighLevelResponse>(`${AB_BASE}/${encodeURIComponent(mbid)}/high-level`);

  const bpmRaw = low.rhythm?.bpm;
  const bpm = typeof bpmRaw === 'number' && Number.isFinite(bpmRaw) ? Math.round(bpmRaw) : null;

  const camelot = toCamelot(low.tonal?.key_key ?? null, low.tonal?.key_scale ?? null);

  const energy = deriveEnergy(high?.highlevel?.mood_aggressive?.probability ?? null);

  const moods = selectMoods(high?.highlevel ?? null);

  return { bpm, camelot, energy, moods };
}
