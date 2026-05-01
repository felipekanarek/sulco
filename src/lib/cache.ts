import 'server-only';

/**
 * Cache em memória local do processo serverless (Inc 23 follow-up).
 *
 * `unstable_cache` do Next 15 não funcionou de forma confiável no
 * Vercel Hobby — visitas consecutivas consumiam ~40-100k reads cada,
 * indicando que o Data Cache não persiste entre invocations Lambda.
 * Substituído por Map global do processo, que sobrevive entre
 * requests dentro do mesmo container quente.
 *
 * Trade-off:
 * - HIT enquanto o container está quente (típico ~15min de
 *   inatividade até desligar) — gratuito, instantâneo.
 * - COLD start zera o cache. Próxima request paga miss completo.
 *   Aceitável pra single user solo (cold raro entre acessos).
 * - Multi-region: cada região mantém Map próprio (sem sync). Felipe
 *   é solo BR — região única.
 *
 * TTL default 300s. Tag por user via `revalidateUserCache(userId)`
 * que remove entries cujo key inclui esse userId.
 */

type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 300 * 1000; // 5min

function serializeArg(arg: unknown): string {
  if (arg === null || arg === undefined) return '';
  if (typeof arg === 'object') {
    const keys = Object.keys(arg as Record<string, unknown>).sort();
    return JSON.stringify(arg, keys);
  }
  return String(arg);
}

function makeKey(name: string, userId: number, rest: unknown[]): string {
  return `${name}|u:${userId}|${rest.map(serializeArg).join('|')}`;
}

/**
 * Envolve uma query function (com `userId` como primeiro arg) em
 * cache em memória local.
 *
 * - HIT: retorna value armazenado se ainda dentro do TTL.
 * - MISS: executa `fn`, armazena, retorna.
 *
 * Multi-user isolation via `userId` no key.
 */
export function cacheUser<TArgs extends unknown[], TReturn>(
  fn: (userId: number, ...rest: TArgs) => Promise<TReturn>,
  name: string,
  options?: { revalidate?: number },
): (userId: number, ...rest: TArgs) => Promise<TReturn> {
  const ttl = (options?.revalidate ?? 300) * 1000;
  return async (userId: number, ...rest: TArgs) => {
    const key = makeKey(name, userId, rest);
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expires > now) {
      return entry.value as TReturn;
    }
    const value = await fn(userId, ...rest);
    cache.set(key, { value, expires: now + ttl });
    return value;
  };
}

/**
 * Invalida TODAS as entries cujo key referencia esse userId.
 * Chamado pelo final das Server Actions de write críticas.
 */
export function revalidateUserCache(userId: number): void {
  const marker = `|u:${userId}|`;
  for (const key of cache.keys()) {
    if (key.includes(marker)) cache.delete(key);
  }
}
