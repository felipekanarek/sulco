import 'server-only';

/**
 * Cache helper — NO-OP intencional (Inc 23 follow-up).
 *
 * Tentamos `unstable_cache` (Next 15) e Map in-memory global em
 * sequência. Nenhum funcionou no Vercel Hobby — cada request cai
 * num container Lambda fresh, sem persistência entre invocations.
 * Cache continuava miss em 100% das recargas, gastando ~100k reads
 * cada.
 *
 * Decisão: manter API `cacheUser`/`revalidateUserCache` mas como
 * pass-through. Callsites ficam intactos. Se algum dia migrar pra
 * Vercel Pro com Edge Cache shared OU Redis externo, é só
 * reimplementar aqui.
 *
 * Estratégia atual de redução de reads é via **paginação** (Inc 22)
 * + LIMIT 1000 em queryCandidates + prefetch=false + ImportPoller
 * removido — esses funcionam independente de cache.
 */

export function cacheUser<TArgs extends unknown[], TReturn>(
  fn: (userId: number, ...rest: TArgs) => Promise<TReturn>,
  // Args mantidos pra preservar interface; ignorados por enquanto.
  _name: string,
  _options?: { revalidate?: number },
): (userId: number, ...rest: TArgs) => Promise<TReturn> {
  return (userId, ...rest) => fn(userId, ...rest);
}

export function revalidateUserCache(_userId: number): void {
  // no-op
}
