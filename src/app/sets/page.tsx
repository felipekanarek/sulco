import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { listSets, type SetRow } from '@/lib/queries/sets';
import { formatDateOnly } from '@/lib/tz';
import type { SetStatus } from '@/lib/tz';

/**
 * Rota `/sets` — lista de sets (FR-021). Status derivado de eventDate
 * (draft/scheduled/done → Rascunho/Agendado/Realizado em pt-BR).
 */
export default async function SetsPage() {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const rows = await listSets(user.id);

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8">
      <section className="flex flex-col md:grid md:grid-cols-[1fr_auto] md:items-end gap-3 md:gap-8 pb-4 md:pb-6 border-b border-line mb-6 md:mb-8">
        <div>
          <p className="eyebrow mb-2">histórico e planejamento</p>
          <h1 className="title-display text-[34px] md:text-[44px]">Sets</h1>
        </div>
        <Link
          href="/sets/novo"
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 min-h-[44px] inline-flex items-center justify-center rounded-sm hover:bg-accent transition-colors self-start md:self-auto"
        >
          + Novo set
        </Link>
      </section>

      {rows.length === 0 ? (
        <div className="border border-dashed border-line p-6 md:p-10 text-center">
          <p className="eyebrow mb-2">Nenhum set ainda</p>
          <p className="font-serif italic text-lg md:text-xl text-ink-soft mb-6">
            Comece criando seu primeiro set — uma coletânea ordenada de faixas pra um evento.
          </p>
          <Link
            href="/sets/novo"
            className="inline-flex items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 min-h-[44px] rounded-sm hover:bg-accent transition-colors"
          >
            + Novo set
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {rows.map((s) => (
            <SetCard key={s.id} set={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SetCard({ set }: { set: SetRow }) {
  return (
    <Link
      href={`/sets/${set.id}`}
      className="border border-line bg-paper-raised p-6 md:p-8 rounded-sm flex flex-col gap-4 hover:border-ink active:border-ink transition-colors"
    >
      <StatusPill status={set.status} />
      <p className="label-tech">
        {set.eventDate ? formatDateOnly(set.eventDate) : 'sem data'} · {set.location ?? '—'}
      </p>
      <h3 className="font-serif italic text-[24px] md:text-[32px] font-medium tracking-tight leading-tight">
        {set.name}
      </h3>
      {set.briefing ? (
        <p className="font-serif italic text-ink-soft leading-relaxed pt-3 border-t border-line-soft text-[15px] md:text-base">
          {set.briefing.length > 140 ? set.briefing.slice(0, 140) + '…' : set.briefing}
        </p>
      ) : null}
      <dl className="flex gap-6 md:gap-8 pt-3 border-t border-line-soft mt-auto">
        <Stat label="Faixas" value={set.trackCount} />
        <Stat label="Discos" value={set.recordCount} />
      </dl>
    </Link>
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

function StatusPill({ status }: { status: SetStatus }) {
  const cfg = {
    draft: { label: 'Rascunho', cls: 'text-warn border-warn' },
    scheduled: { label: 'Agendado', cls: 'text-accent border-accent/60' },
    done: { label: 'Realizado', cls: 'text-ink-mute border-line' },
  }[status];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border rounded-sm self-start ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
