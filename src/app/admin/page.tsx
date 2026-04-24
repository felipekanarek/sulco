import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { listAllUsers } from '@/lib/queries/admin';
import { AdminRow } from '@/components/admin-row';

export const dynamic = 'force-dynamic';

/**
 * Rota `/admin` — painel de leitura-apenas para o owner (FR-010, FR-011).
 * Não-owner recebe 404.
 */
export default async function AdminPage() {
  await requireOwner();
  const rows = await listAllUsers();

  return (
    <main className="max-w-[1000px] mx-auto px-8 pt-12 pb-24">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="eyebrow mb-3">Administração</p>
          <h1 className="font-serif italic text-4xl leading-tight">
            Painel de contas
          </h1>
        </div>
        <Link
          href="/admin/convites"
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line text-ink hover:border-ink px-4 py-2 rounded-sm transition-colors"
        >
          Convites →
        </Link>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-6">
        {rows.length} {rows.length === 1 ? 'conta' : 'contas'}
      </p>

      {rows.length === 0 ? (
        <p className="font-serif italic text-ink-soft">Nenhuma conta ainda.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink">
              <th
                scope="col"
                className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute"
              >
                Email
              </th>
              <th
                scope="col"
                className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute"
              >
                Discogs
              </th>
              <th
                scope="col"
                className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute"
              >
                Discos
              </th>
              <th
                scope="col"
                className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute"
              >
                Último sync
              </th>
              <th
                scope="col"
                className="py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute"
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <AdminRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
