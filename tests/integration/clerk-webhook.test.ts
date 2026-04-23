import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Testes do webhook da Clerk (T027).
 *
 * NOTA: Este teste exercita apenas a lógica da rota em isolamento (verificação
 * de assinatura + efeitos no banco). A integração com Svix real fica coberta
 * manualmente via `ngrok` + dashboard Clerk (quickstart §8).
 */

describe('clerk webhook route handler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('retorna 400 quando headers svix estão ausentes', async () => {
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_test_dummy_secret_value_for_tests';
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      body: JSON.stringify({ type: 'user.created', data: { id: 'u1' } }),
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
  });

  it('retorna 400 em assinatura svix inválida', async () => {
    // Svix exige secret em base64 válido (formato Clerk: whsec_<base64>)
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_x',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalid==',
      },
      body: JSON.stringify({ type: 'user.created', data: { id: 'u1' } }),
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
  });

  it.todo('user.created idempotente: INSERT ON CONFLICT DO NOTHING');
  it.todo('user.deleted cascata apaga records/tracks/sets/setTracks/syncRuns');
  it.todo('user.deleted aborta syncRuns em andamento com outcome=erro');
  it.todo('eventos desconhecidos retornam 200 { ignored: <type> }');
});
