import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';

/**
 * Cache layer (Inc 23 / 022) — wrapper canônico em torno de
 * `unstable_cache` do Next 15. Tag por user (`user:${userId}`)
 * cobre invalidação grossa de TODAS as queries cacheadas do
 * mesmo user em uma chamada de `revalidateUserCache`.
 *
 * TTL default 300s (5min) é guard-rail contra bug de invalidação
 * esquecida em alguma Server Action de write (Clarification Q2 /
 * Decisão 5 do research).
 */

const DEFAULT_REVALIDATE = 300; // 5min

function userTag(userId: number): string {
  return `user:${userId}`;
}

/**
 * Serialização determinística de args pra cache key. Garante que
 * mesma combinação de args gera mesma key entre invocations
 * (objects com keys ordenadas alfabeticamente).
 */
function serializeArg(arg: unknown): string {
  if (arg === null || arg === undefined) return '';
  if (typeof arg === 'object') {
    const keys = Object.keys(arg as Record<string, unknown>).sort();
    return JSON.stringify(arg, keys);
  }
  return String(arg);
}

/**
 * Envolve uma query function (com `userId` como primeiro arg) em
 * `unstable_cache`, aplicando pattern padrão:
 * - cache key: `[name, userId, ...rest.map(serializeArg)]`
 * - tags: `['user:${userId}']`
 * - revalidate: `options.revalidate ?? 300`
 *
 * Multi-user isolation garantida via tag por user. Invalidação
 * cruzada via `revalidateUserCache(userId)`.
 */
export function cacheUser<TArgs extends unknown[], TReturn>(
  fn: (userId: number, ...rest: TArgs) => Promise<TReturn>,
  name: string,
  options?: { revalidate?: number },
): (userId: number, ...rest: TArgs) => Promise<TReturn> {
  return async (userId: number, ...rest: TArgs) => {
    const cached = unstable_cache(
      () => fn(userId, ...rest),
      [name, String(userId), ...rest.map(serializeArg)],
      {
        tags: [userTag(userId)],
        revalidate: options?.revalidate ?? DEFAULT_REVALIDATE,
      },
    );
    return cached();
  };
}

/**
 * Invalida TODAS as queries cacheadas do user.
 * Chamado pelo final das Server Actions de write críticas — em
 * adição (não substituição) ao `revalidatePath` existente.
 */
export function revalidateUserCache(userId: number): void {
  revalidateTag(userTag(userId));
}
