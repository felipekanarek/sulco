import Link from 'next/link';
import { requireOwner, OWNER_EMAIL } from '@/lib/auth';
import { listInvites, addInvite, removeInvite } from '@/lib/actions';

export const dynamic = 'force-dynamic';

/**
 * Rota `/admin/convites` — gestão da allowlist interna
 * (FR-002, FR-010, FR-011). Apenas owner acessa; demais recebem 404.
 */
export default async function AdminInvitesPage() {
  await requireOwner();
  const list = await listInvites();

  return (
    <main className="max-w-[760px] mx-auto px-8 pt-12 pb-24">
      <p className="eyebrow mb-3">
        <Link href="/admin" className="hover:text-ink">
          ← Painel
        </Link>
        {' · '}
        Administração
      </p>
      <h1 className="font-serif italic text-4xl leading-tight mb-2">
        Convites
      </h1>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-8">
        {list.length} {list.length === 1 ? 'convite ativo' : 'convites ativos'}
      </p>

      <form
        action={async (formData: FormData) => {
          'use server';
          const email = String(formData.get('email') ?? '');
          await addInvite({ email });
        }}
        className="flex items-center gap-3 mb-8 border-b border-line pb-6"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="amigo@exemplo.com"
          className="flex-1 font-mono text-[14px] bg-transparent border-b border-line py-2 outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink text-ink hover:bg-ink hover:text-paper px-4 py-2 rounded-sm transition-colors"
        >
          Adicionar
        </button>
      </form>

      {list.length === 0 ? (
        <p className="font-serif italic text-ink-soft">
          Nenhum convite ainda. Adicione o primeiro no formulário acima.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <p className="font-mono text-[14px] text-ink">{invite.email}</p>
                {invite.createdAt ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                    Desde{' '}
                    {invite.createdAt.toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </p>
                ) : null}
              </div>
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const email = String(formData.get('email') ?? '');
                  await removeInvite({ email });
                }}
              >
                <input type="hidden" name="email" value={invite.email} />
                <button
                  type="submit"
                  className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line text-ink-soft hover:border-warn hover:text-warn px-3 py-1 rounded-sm transition-colors"
                >
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="font-serif text-[14px] text-ink-mute mt-10 leading-relaxed">
        Usuários com esses emails podem criar conta no Sulco. O owner
        <span className="font-mono text-[12px]"> ({OWNER_EMAIL ?? '—'})</span>
        {' '}é sempre allowlisted, mesmo sem estar nesta lista.
      </p>
    </main>
  );
}
