import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';

/**
 * T029 / FR-019 + SC-006 — Falha do enriquecimento NÃO bloqueia sync
 * do Discogs e NÃO interrompe o loop do cron (user B é processado
 * mesmo que user A falhe no enrich).
 */

describe('T029 — cron absorve falha do enrich (SC-006)', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  const runSync = vi.fn();
  const enrichBacklog = vi.fn();

  beforeEach(async () => {
    process.env.CRON_SECRET = 'supersecret';
    ctx = await createTestDb();

    // Seed 2 usuários com credenciais válidas
    const schema = await import('@/db/schema');
    await ctx.db.insert(schema.users).values([
      {
        clerkUserId: 'u_a',
        email: 'a@a',
        discogsUsername: 'a',
        discogsTokenEncrypted: 'v1:a:b:c',
        discogsCredentialStatus: 'valid',
      },
      {
        clerkUserId: 'u_b',
        email: 'b@b',
        discogsUsername: 'b',
        discogsTokenEncrypted: 'v1:d:e:f',
        discogsCredentialStatus: 'valid',
      },
    ]);

    runSync.mockClear();
    enrichBacklog.mockClear();

    runSync.mockResolvedValue({ outcome: 'ok' });

    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('@/lib/discogs/sync', () => ({ runDailyAutoSync: runSync }));
    vi.doMock('@/lib/acousticbrainz', () => ({ enrichUserBacklog: enrichBacklog }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/discogs/sync');
    vi.doUnmock('@/lib/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
    if (ORIGINAL_ENV === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('enrich do user A falha → user B continua sendo sincronizado e enriquecido', async () => {
    enrichBacklog
      .mockImplementationOnce(async () => {
        throw new Error('MB down');
      })
      .mockResolvedValueOnce({
        recordsProcessed: 3,
        tracksUpdated: 5,
        tracksSkipped: 0,
        errors: 0,
        durationMs: 100,
      });

    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', {
      method: 'POST',
      headers: { authorization: 'Bearer supersecret' },
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();

    // runDailyAutoSync rodou pros 2 users — independe do enrich
    expect(runSync).toHaveBeenCalledTimes(2);
    expect(body.ran).toBe(2);
    expect(body.ok).toBe(2);

    // enrichUserBacklog rodou pros 2 users (falha não aborta o loop)
    expect(enrichBacklog).toHaveBeenCalledTimes(2);
    expect(body.enrich.recordsProcessed).toBe(3);
    expect(body.enrich.tracksUpdated).toBe(5);
    // Falha do user A contabilizada como erro
    expect(body.enrich.errors).toBeGreaterThanOrEqual(1);
  });

  it('enrich de ambos users falha → response ainda é 200 com sync ok', async () => {
    enrichBacklog.mockImplementation(async () => {
      throw new Error('AB down');
    });

    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', {
      method: 'POST',
      headers: { authorization: 'Bearer supersecret' },
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(runSync).toHaveBeenCalledTimes(2);
    expect(body.ok).toBe(2); // sync Discogs inalterado
    expect(body.enrich.errors).toBe(2);
    expect(body.enrich.tracksUpdated).toBe(0);
  });

  it('sync Discogs falha em user A → enrich ainda tenta rodar pra user A', async () => {
    // Mesmo que sync falhe, enrich recebe oportunidade (backlog pode
    // ter faixas pendentes de runs anteriores). Não é o "happy path"
    // mas documenta contrato: enrich e sync são independentes.
    runSync
      .mockImplementationOnce(async () => {
        throw new Error('Discogs 500');
      })
      .mockResolvedValueOnce({ outcome: 'ok' });
    enrichBacklog.mockResolvedValue({
      recordsProcessed: 0,
      tracksUpdated: 0,
      tracksSkipped: 0,
      errors: 0,
      durationMs: 10,
    });

    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', {
      method: 'POST',
      headers: { authorization: 'Bearer supersecret' },
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.erro).toBe(1);
    expect(body.ok).toBe(1);
    // Enrich tentou nos 2 users independentemente do sync
    expect(enrichBacklog).toHaveBeenCalledTimes(2);
  });
});
