import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Testes unitários do cliente Discogs (T030). Foco em:
 * - Rate limit: bucket esgota aos 60 req/min e bloqueia até refill.
 * - HTTP 429: pausa e retoma usando Retry-After.
 * - HTTP 401: propaga DiscogsAuthError para o caller.
 *
 * `fetch` é mockado globalmente. `getTokenForUser` e DB são inacessíveis aqui,
 * então testamos `validateCredential` (que não passa pelo bucket) e o
 * retry/auth logic via fetch mock.
 */

describe('discogs client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('validateCredential retorna true em HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })));
    const { validateCredential } = await import('@/lib/discogs/client');
    const ok = await validateCredential('valid_pat_token_abc123');
    expect(ok).toBe(true);
  });

  it('validateCredential retorna false em HTTP 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    const { validateCredential } = await import('@/lib/discogs/client');
    const ok = await validateCredential('bad_pat');
    expect(ok).toBe(false);
  });

  it('validateCredential lança em HTTP 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Server error', { status: 500 })));
    const { validateCredential, DiscogsError } = await import('@/lib/discogs/client');
    await expect(validateCredential('any')).rejects.toBeInstanceOf(DiscogsError);
  });

  it.todo('token bucket: 61a chamada espera ~1s antes de executar');
  it.todo('HTTP 429 com Retry-After: retry após espera; sucesso no segundo attempt');
  it.todo('HTTP 429 sem Retry-After: backoff exponencial 1s→2s→4s');
  it.todo('HTTP 401 em discogsFetch propaga DiscogsAuthError (caller chama markCredentialInvalid)');
  it.todo('HTTP 500 com retry em 2 tentativas antes de sucesso');
});
