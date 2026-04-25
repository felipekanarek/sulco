import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { decryptPAT } from '@/lib/crypto';

const DISCOGS_BASE = 'https://api.discogs.com';
const USER_AGENT = 'Sulco/0.1 (+https://sulco.app)';

// ============================================================
// Tipos públicos
// ============================================================

export type DiscogsReleaseTrack = {
  position: string;
  title: string;
  duration: string | null;
};

export type DiscogsRelease = {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  country: string | null;
  format: string | null;
  coverUrl: string | null;
  genres: string[];
  styles: string[];
  tracklist: DiscogsReleaseTrack[];
};

export type CollectionPage = {
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  releases: {
    id: number;
    date_added: string;
  }[];
};

export class DiscogsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'DiscogsError';
  }
}

export class DiscogsAuthError extends DiscogsError {
  constructor() {
    super('Discogs rejeitou o token (HTTP 401)', 401);
    this.name = 'DiscogsAuthError';
  }
}

// ============================================================
// Rate limiter — token bucket por userId
// ============================================================

type Bucket = { tokens: number; lastRefillMs: number };
const RATE_LIMIT_PER_MINUTE = 60;
const REFILL_INTERVAL_MS = 60_000 / RATE_LIMIT_PER_MINUTE; // ~1000ms
const buckets = new Map<number, Bucket>();

function getBucket(userId: number): Bucket {
  const existing = buckets.get(userId);
  if (existing) return existing;
  const b = { tokens: RATE_LIMIT_PER_MINUTE, lastRefillMs: Date.now() };
  buckets.set(userId, b);
  return b;
}

async function acquireToken(userId: number): Promise<void> {
  const bucket = getBucket(userId);
  const now = Date.now();
  const elapsed = now - bucket.lastRefillMs;
  if (elapsed > 0) {
    const refill = Math.floor(elapsed / REFILL_INTERVAL_MS);
    if (refill > 0) {
      bucket.tokens = Math.min(RATE_LIMIT_PER_MINUTE, bucket.tokens + refill);
      bucket.lastRefillMs += refill * REFILL_INTERVAL_MS;
    }
  }
  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return;
  }
  // Sem tokens — espera o próximo refill
  const wait = REFILL_INTERVAL_MS - ((now - bucket.lastRefillMs) % REFILL_INTERVAL_MS);
  await new Promise((r) => setTimeout(r, wait));
  return acquireToken(userId);
}

// ============================================================
// Fetch autenticado com retry em 429
// ============================================================

type FetchOpts = {
  userId: number;
  token: string;
  endpoint: string;
  method?: 'GET' | 'POST';
};

async function discogsFetch({ userId, token, endpoint, method = 'GET' }: FetchOpts): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${DISCOGS_BASE}${endpoint}`;

  const maxRetries = 5;
  let attempt = 0;
  let backoffMs = 1000;

  while (true) {
    attempt += 1;
    await acquireToken(userId);
    const started = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Discogs token=${token}`,
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });
    const durationMs = Date.now() - started;
    const rateLimitRemaining = res.headers.get('x-discogs-ratelimit-remaining');
    logDiscogsCall({
      userId,
      endpoint,
      status: res.status,
      durationMs,
      rateLimitRemaining: rateLimitRemaining ? Number(rateLimitRemaining) : undefined,
    });

    if (res.status === 401) {
      throw new DiscogsAuthError();
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '');
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoffMs / 1000;
      if (attempt >= maxRetries) {
        throw new DiscogsError('Rate limit excedido após retries', 429, seconds);
      }
      const jitter = 0.9 + Math.random() * 0.2; // ±10%
      await new Promise((r) => setTimeout(r, seconds * 1000 * jitter));
      backoffMs = Math.min(backoffMs * 2, 60_000);
      continue;
    }

    if (res.status >= 500 && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60_000);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new DiscogsError(`Discogs HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
    }

    return res;
  }
}

function logDiscogsCall(payload: {
  userId: number;
  endpoint: string;
  status: number;
  durationMs: number;
  rateLimitRemaining?: number;
}) {
  // JSON estruturado para observabilidade (research.md §5). Console por enquanto.
  console.log(JSON.stringify({ event: 'discogs.fetch', ...payload }));
}

// ============================================================
// API pública do cliente
// ============================================================

/**
 * Valida um PAT sem passar pelo token bucket (usado no onboarding antes de ter userId).
 * Retorna `true` se o PAT é aceito pelo Discogs, `false` se 401, lança em outros erros.
 */
export async function validateCredential(pat: string): Promise<boolean> {
  const res = await fetch(`${DISCOGS_BASE}/oauth/identity`, {
    headers: {
      Authorization: `Discogs token=${pat}`,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (res.status === 401) return false;
  if (!res.ok) {
    const text = await res.text();
    throw new DiscogsError(`Discogs HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return true;
}

async function getTokenForUser(userId: number): Promise<string> {
  const rows = await db
    .select({ enc: users.discogsTokenEncrypted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const enc = rows[0]?.enc;
  if (!enc) {
    throw new Error(`User ${userId} sem PAT Discogs cifrado`);
  }
  return decryptPAT(enc);
}

export async function fetchCollectionPage(
  userId: number,
  opts: { page: number; perPage?: number },
): Promise<CollectionPage> {
  const token = await getTokenForUser(userId);
  const rows = await db
    .select({ username: users.discogsUsername })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const username = rows[0]?.username;
  if (!username) throw new Error(`User ${userId} sem discogsUsername`);
  const perPage = opts.perPage ?? 100;
  const res = await discogsFetch({
    userId,
    token,
    endpoint: `/users/${encodeURIComponent(username)}/collection/folders/0/releases?per_page=${perPage}&page=${opts.page}&sort=added&sort_order=desc`,
  });
  const json = (await res.json()) as {
    pagination: CollectionPage['pagination'];
    releases: Array<{ id: number; date_added: string }>;
  };
  return {
    pagination: json.pagination,
    releases: json.releases.map((r) => ({ id: r.id, date_added: r.date_added })),
  };
}

/**
 * Verifica se um release específico ainda está na coleção do user.
 * Endpoint: `/users/{username}/collection/folders/0/releases/{release_id}`
 * → 200 se sim, 404 se não.
 *
 * Usado pelo sync incremental (Bug 12 fix) pra evitar falso-positivo
 * de archive quando disco caiu pra fora da 1ª página por novos terem
 * sido adicionados (não foi removido — só empurrado).
 */
export async function existsInUserCollection(
  userId: number,
  releaseId: number,
): Promise<boolean> {
  const token = await getTokenForUser(userId);
  const rows = await db
    .select({ username: users.discogsUsername })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const username = rows[0]?.username;
  if (!username) throw new Error(`User ${userId} sem discogsUsername`);
  try {
    await discogsFetch({
      userId,
      token,
      endpoint: `/users/${encodeURIComponent(username)}/collection/folders/0/releases/${releaseId}`,
    });
    return true;
  } catch (err) {
    if (err instanceof DiscogsError && err.status === 404) return false;
    throw err;
  }
}

export async function fetchRelease(userId: number, releaseId: number): Promise<DiscogsRelease> {
  const token = await getTokenForUser(userId);
  const res = await discogsFetch({
    userId,
    token,
    endpoint: `/releases/${releaseId}`,
  });
  type RawRelease = {
    id: number;
    artists_sort?: string;
    title: string;
    year?: number;
    labels?: { name: string }[];
    country?: string;
    formats?: { name: string; descriptions?: string[] }[];
    genres?: string[];
    styles?: string[];
    images?: { type: string; uri: string }[];
    tracklist?: { position: string; title: string; duration?: string }[];
  };
  const raw = (await res.json()) as RawRelease;
  const cover = raw.images?.find((i) => i.type === 'primary') ?? raw.images?.[0];
  const formatStr = raw.formats
    ?.map((f) => [f.name, ...(f.descriptions ?? [])].filter(Boolean).join(', '))
    .join(' | ') ?? null;
  return {
    id: raw.id,
    artist: raw.artists_sort ?? 'Unknown',
    title: raw.title,
    year: raw.year ?? null,
    label: raw.labels?.[0]?.name ?? null,
    country: raw.country ?? null,
    format: formatStr,
    coverUrl: cover?.uri ?? null,
    genres: raw.genres ?? [],
    styles: raw.styles ?? [],
    tracklist: (raw.tracklist ?? [])
      .filter((t) => t.position && t.title)
      .map((t) => ({ position: t.position, title: t.title, duration: t.duration ?? null })),
  };
}

export const __testing = { buckets, acquireToken };
