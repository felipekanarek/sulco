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
    <main className="max-w-[1000px] mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-16 md:pb-24">
      <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-3 md:gap-8 mb-6 md:mb-8">
        <div>
          <p className="eyebrow mb-3">Administração</p>
          <h1 className="font-serif italic text-3xl md:text-4xl leading-tight">
            Painel de contas
          </h1>
        </div>
        <Link
          href="/admin/convites"
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line text-ink hover:border-ink active:border-ink px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-sm transition-colors self-start md:self-auto"
        >
          Convites →
        </Link>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-4 md:mb-6">
        {rows.length} {rows.length === 1 ? 'conta' : 'contas'}
      </p>

      {rows.length === 0 ? (
        <p className="font-serif italic text-ink-soft">Nenhuma conta ainda.</p>
      ) : (
        <table className="w-full hidden md:table">
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

      {/* Mobile: cards verticais (substitui a table desktop) */}
      {rows.length > 0 ? (
        <ul className="md:hidden flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={`m-${r.id}`}
              className="border border-line bg-paper-raised rounded-sm p-4 flex flex-col gap-2"
            >
              <p className="font-mono text-[13px] text-ink break-all">{r.email}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <dt className="font-mono uppercase tracking-[0.1em] text-ink-mute">Discogs</dt>
                <dd className="font-mono text-ink truncate">{r.discogsUsername || '—'}</dd>
                <dt className="font-mono uppercase tracking-[0.1em] text-ink-mute">Discos</dt>
                <dd className="font-serif italic text-ink">{r.recordsCount}</dd>
                <dt className="font-mono uppercase tracking-[0.1em] text-ink-mute">Último sync</dt>
                <dd className="font-mono text-ink-soft">
                  {r.lastSyncAt
                    ? r.lastSyncAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                    : '—'}
                </dd>
                <dt className="font-mono uppercase tracking-[0.1em] text-ink-mute">Status</dt>
                <dd className={`font-mono text-[11px] uppercase tracking-[0.1em] ${r.discogsCredentialStatus === 'invalid' ? 'text-warn' : 'text-ok'}`}>
                  {r.discogsCredentialStatus === 'invalid' ? 'inválido' : 'ok'}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
