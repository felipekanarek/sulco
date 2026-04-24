import type { AdminRow as AdminRowData } from '@/lib/queries/admin';

/**
 * Linha da tabela `/admin`. Server Component puro (zero JS).
 * Regra do badge: verde "OK" se credencial válida E último sync ok/running/null.
 * Vermelho "Atenção" se credencial inválida OU último sync erro/rate_limited/parcial
 * OU records=0 com conta mais velha que 24h.
 */

const STATUS_24H_MS = 24 * 60 * 60 * 1000;

function computeBadge(row: AdminRowData): { tone: 'ok' | 'warn'; label: string } {
  if (row.discogsCredentialStatus === 'invalid') {
    return { tone: 'warn', label: 'Credencial inválida' };
  }
  if (
    row.lastSyncOutcome === 'erro' ||
    row.lastSyncOutcome === 'rate_limited' ||
    row.lastSyncOutcome === 'parcial'
  ) {
    return { tone: 'warn', label: 'Último sync com erro' };
  }
  if (
    row.recordsCount === 0 &&
    row.createdAt &&
    Date.now() - row.createdAt.getTime() > STATUS_24H_MS
  ) {
    return { tone: 'warn', label: 'Sem importar há >24h' };
  }
  if (!row.allowlisted && !row.isOwner) {
    return { tone: 'warn', label: 'Sem allowlist' };
  }
  return { tone: 'ok', label: 'OK' };
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AdminRow({ row }: { row: AdminRowData }) {
  const badge = computeBadge(row);
  const badgeClasses =
    badge.tone === 'ok'
      ? 'border-ok text-ok'
      : 'border-warn text-warn';

  return (
    <tr className="border-b border-line">
      <td className="py-3 pr-4">
        <div className="font-mono text-[13px] text-ink">
          {row.email}
          {row.isOwner ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
              owner
            </span>
          ) : null}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
          Criado {formatDate(row.createdAt)}
        </div>
      </td>
      <td className="py-3 pr-4 font-mono text-[12px] text-ink-soft">
        {row.discogsUsername ?? '—'}
      </td>
      <td className="py-3 pr-4 font-mono text-[13px] text-ink tabular-nums">
        {row.recordsCount}
      </td>
      <td className="py-3 pr-4 font-mono text-[12px] text-ink-soft">
        {formatDate(row.lastSyncAt)}
      </td>
      <td className="py-3">
        <span
          aria-label={`Status: ${badge.label}`}
          className={`font-mono text-[10px] uppercase tracking-[0.12em] border ${badgeClasses} px-2 py-[2px] rounded-sm inline-block`}
        >
          {badge.label}
        </span>
      </td>
    </tr>
  );
}
