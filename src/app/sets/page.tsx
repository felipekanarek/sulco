import Link from 'next/link';
import { db, sets, setTracks, tracks, records } from '@/db';
import { eq, sql, desc } from 'drizzle-orm';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SetsPage() {
  const rows = await db
    .select({
      id: sets.id,
      name: sets.name,
      eventDate: sets.eventDate,
      location: sets.location,
      briefing: sets.briefing,
      status: sets.status,
      trackCount: sql<number>`(select count(*) from ${setTracks} where ${setTracks.setId} = ${sets.id})`,
      recordCount: sql<number>`(select count(distinct ${tracks.recordId}) from ${setTracks} join ${tracks} on ${tracks.id} = ${setTracks.trackId} where ${setTracks.setId} = ${sets.id})`,
    })
    .from(sets)
    .orderBy(desc(sets.eventDate));

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <section className="grid grid-cols-[1fr_auto] items-end gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2">histórico e planejamento</p>
          <h1 className="title-display text-[44px]">Sets</h1>
        </div>
        <Link
          href="/sets/novo"
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 rounded-sm hover:bg-accent"
        >
          + Novo set
        </Link>
      </section>

      {rows.length === 0 ? (
        <p className="font-serif italic text-ink-mute text-center py-12">Nenhum set criado ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {rows.map((s) => (
            <Link
              key={s.id}
              href={`/sets/${s.id}`}
              className="border border-line bg-paper-raised p-8 rounded-sm flex flex-col gap-4 hover:border-ink transition-colors"
            >
              <StatusPill status={s.status} />
              <p className="label-tech">{formatDate(s.eventDate)} · {s.location ?? '—'}</p>
              <h3 className="font-serif italic text-[32px] font-medium tracking-tight leading-tight">
                {s.name}
              </h3>
              {s.briefing && (
                <p className="font-serif italic text-ink-soft leading-relaxed pt-3 border-t border-line-soft">
                  {s.briefing.length > 140 ? s.briefing.slice(0, 140) + '…' : s.briefing}
                </p>
              )}
              <dl className="flex gap-8 pt-3 border-t border-line-soft mt-auto">
                <Stat label="Faixas" value={s.trackCount} />
                <Stat label="Discos" value={s.recordCount} />
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</dt>
      <dd className="font-serif italic text-[19px] mt-0.5">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg = {
    draft: { label: 'Rascunho', cls: 'text-warn border-warn' },
    scheduled: { label: 'Agendado', cls: 'text-accent border-accent-soft' },
    done: { label: 'Realizado', cls: 'text-ink-mute border-line' },
  }[status] ?? { label: status, cls: 'text-ink-mute border-line' };
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border rounded-sm self-start ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
