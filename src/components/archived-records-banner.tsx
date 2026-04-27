import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/db';
import { records } from '@/db/schema';

/**
 * Banner global para discos arquivados ainda não reconhecidos (FR-036).
 * Conta records com `archived=true AND archivedAcknowledgedAt IS NULL`.
 * RSC: sem estado local.
 */
export async function ArchivedRecordsBanner() {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(records)
    .where(
      and(
        eq(records.userId, user.id),
        eq(records.archived, true),
        isNull(records.archivedAcknowledgedAt),
      ),
    );
  const count = Number(rows[0]?.c ?? 0);
  if (count === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warn/10 border-y border-warn text-ink px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4"
    >
      <p className="font-serif text-[14px] md:text-[15px]">
        <span className="font-mono text-[10px] md:text-[11px] uppercase tracking-[0.12em] text-warn mr-2 md:mr-3 block md:inline mb-1 md:mb-0">
          Coleção
        </span>
        {count === 1
          ? '1 disco foi removido da sua coleção Discogs e arquivado. Campos autorais estão preservados.'
          : `${count} discos foram removidos da sua coleção Discogs e arquivados. Campos autorais estão preservados.`}
      </p>
      <Link
        href="/status"
        className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink text-ink hover:bg-ink hover:text-paper px-4 py-2 min-h-[44px] flex items-center justify-center rounded-sm transition-colors whitespace-nowrap self-start md:self-auto"
      >
        Revisar →
      </Link>
    </div>
  );
}
