import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';

/**
 * T019 (FR-018 + FR-018a) — applyDiscogsUpdate dispara enrichRecord
 * em fire-and-forget após criar/atualizar tracks de um disco novo.
 *
 * Abordagem: mocka `@/lib/acousticbrainz` com um spy em `enrichRecord`
 * pra validar o wiring (chamada, argumentos) sem acionar os clientes
 * HTTP reais.
 */

describe('T019 — enrich trigger imediato pós-apply-update', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  const enrichSpy = vi.fn(async (_userId: number, _recordId: number) => ({
    recordId: _recordId,
    mbidsResolved: 0,
    tracksUpdated: 0,
    tracksSkipped: 0,
    tracksErrored: 0,
  }));

  beforeEach(async () => {
    ctx = await createTestDb();
    enrichSpy.mockClear();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('@/lib/acousticbrainz', () => ({
      enrichRecord: enrichSpy,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
  });

  async function seedUser() {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'user_t019',
        email: 'felipe@example.com',
        discogsCredentialStatus: 'valid',
      })
      .returning();
    return u.id;
  }

  it('dispara enrichRecord(userId, recordId) após INSERT de disco novo', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    const result = await applyDiscogsUpdate(userId, {
      id: 77777,
      artist: 'Test Artist',
      title: 'Test Album',
      year: 2000,
      label: null,
      country: null,
      format: null,
      coverUrl: null,
      genres: [],
      styles: [],
      tracklist: [
        { position: 'A1', title: 'Track 1', duration: '3:00' },
        { position: 'A2', title: 'Track 2', duration: '4:00' },
      ],
    }, { isNew: true });

    expect(result.created).toBe(true);

    // Aguarda microtasks da promise fire-and-forget resolverem
    await new Promise((r) => setTimeout(r, 20));

    expect(enrichSpy).toHaveBeenCalledTimes(1);
    expect(enrichSpy).toHaveBeenCalledWith(userId, result.recordId);
  });

  it('dispara enrichRecord em reimport quando há faixas no payload (idempotente)', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    // Primeira importação
    await applyDiscogsUpdate(userId, {
      id: 88888,
      artist: 'A', title: 'B', year: null,
      label: null, country: null, format: null, coverUrl: null,
      genres: [], styles: [],
      tracklist: [{ position: 'A1', title: 'T1', duration: null }],
    }, { isNew: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(enrichSpy).toHaveBeenCalledTimes(1);

    // Reimport (mesmos dados) — disparo imediato roda novamente,
    // mas a query de elegibilidade interna do enrichRecord vai skippar.
    // O trigger em si é idempotente (chamar não quebra).
    await applyDiscogsUpdate(userId, {
      id: 88888,
      artist: 'A', title: 'B', year: null,
      label: null, country: null, format: null, coverUrl: null,
      genres: [], styles: [],
      tracklist: [{ position: 'A1', title: 'T1', duration: null }],
    }, { isNew: false });
    await new Promise((r) => setTimeout(r, 20));

    expect(enrichSpy).toHaveBeenCalledTimes(2);
  });

  it('falha em enrichRecord NÃO propaga pro applyDiscogsUpdate (fire-and-forget)', async () => {
    const userId = await seedUser();
    enrichSpy.mockImplementationOnce(async () => {
      throw new Error('MB API down');
    });

    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    // Não deve lançar
    await expect(
      applyDiscogsUpdate(userId, {
        id: 99999,
        artist: 'A', title: 'B', year: null,
        label: null, country: null, format: null, coverUrl: null,
        genres: [], styles: [],
        tracklist: [{ position: 'A1', title: 'T1', duration: null }],
      }, { isNew: true }),
    ).resolves.toBeDefined();

    await new Promise((r) => setTimeout(r, 20));
    expect(enrichSpy).toHaveBeenCalledTimes(1);
  });
});
