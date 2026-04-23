import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/cron/sync-daily (T093)', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    if (ORIGINAL_ENV === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('retorna 500 quando CRON_SECRET não está configurado', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', { method: 'POST' });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(500);
  });

  it('retorna 401 quando authorization está ausente', async () => {
    process.env.CRON_SECRET = 'supersecret';
    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', { method: 'POST' });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
  });

  it('retorna 401 quando Bearer secret não bate', async () => {
    process.env.CRON_SECRET = 'supersecret';
    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
  });

  it.todo('com user elegível, chama runDailyAutoSync e devolve agregado {ran, ok, ...}');
  it.todo('user com discogsCredentialStatus=invalid é pulado (não entra na contagem ran)');
  it.todo('exceção em um user não afeta os demais');
});
