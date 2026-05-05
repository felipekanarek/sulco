/**
 * Inc 37 (034) Tier 2 — `cacheUser` / `revalidateUserCache` (Inc 23).
 *
 * Mocks ativados: nenhum (cache.ts é puramente client-side helper).
 *
 * Princípio coberto: VI bullet 4 — equivalence em camada de cache.
 *
 * NOTA: Inc 23 follow-up converteu `cacheUser` em pass-through
 * intencional (Vercel Hobby não tem shared cache). Estes testes
 * documentam o **contrato atual**: passa args corretamente, retorna
 * resultado da função wrapped, e `revalidateUserCache` é no-op.
 *
 * Quando migrar pra Edge Cache shared / Redis (Inc futuro), estes
 * testes precisam ser estendidos cobrindo TTL, cache hit/miss,
 * tag-based invalidation e multi-user isolation.
 */
import { describe, expect, it, vi } from 'vitest';
import { cacheUser, revalidateUserCache } from '@/lib/cache';

describe('cacheUser (Inc 37 Tier 2) — pass-through atual', () => {
  it('retorna função wrapped que repassa args', async () => {
    const inner = vi.fn(async (userId: number, x: number) => userId + x);
    const wrapped = cacheUser(inner, 'sumWithUser');

    const result = await wrapped(10, 5);
    expect(result).toBe(15);
    expect(inner).toHaveBeenCalledWith(10, 5);
  });

  it('preserva tipos de argumentos rest', async () => {
    const inner = async (userId: number, list: string[], flag: boolean) => ({
      userId,
      list,
      flag,
    });
    const wrapped = cacheUser(inner, 'multiArgs');

    const result = await wrapped(42, ['a', 'b'], true);
    expect(result).toEqual({ userId: 42, list: ['a', 'b'], flag: true });
  });

  it('cada invocação executa inner (sem caching, mesmo args)', async () => {
    const inner = vi.fn(async (userId: number) => userId * 2);
    const wrapped = cacheUser(inner, 'doubleUser');

    await wrapped(7);
    await wrapped(7);
    await wrapped(7);

    expect(inner).toHaveBeenCalledTimes(3); // pass-through, sem dedup
  });

  it('multi-user isolation por construção: userId 1 não interfere em userId 2', async () => {
    const calls: number[] = [];
    const inner = async (userId: number) => {
      calls.push(userId);
      return userId;
    };
    const wrapped = cacheUser(inner, 'identity');

    expect(await wrapped(1)).toBe(1);
    expect(await wrapped(2)).toBe(2);
    expect(calls).toEqual([1, 2]);
  });

  it('revalidateUserCache é no-op (não throw, não retorna)', () => {
    expect(() => revalidateUserCache(1)).not.toThrow();
    expect(revalidateUserCache(999)).toBeUndefined();
  });
});
