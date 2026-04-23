import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { computeBadgeActive } from '@/lib/queries/status';

/**
 * Badge no header indicando eventos novos desde a última visita a /status
 * (FR-041). RSC: sem flicker, dados vêm na renderização.
 */
export async function SyncBadge() {
  const user = await getCurrentUser();
  if (!user) return null;
  const active = await computeBadgeActive(user.id);
  if (!active) return null;

  return (
    <Link
      href="/status"
      className="relative inline-flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] text-accent hover:text-ink transition-colors"
      title="Há alertas novos no painel de sincronização"
      aria-label="Há alertas novos no painel de sincronização — clique para revisar"
    >
      <span
        className="inline-block w-2 h-2 rounded-full bg-accent mr-1.5"
        aria-hidden
      />
      alertas
    </Link>
  );
}
