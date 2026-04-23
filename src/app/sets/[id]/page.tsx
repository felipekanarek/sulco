import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { loadSet } from '@/lib/queries/sets';
import { listSetTracks } from '@/lib/queries/montar';
import { derivePhysicalBag } from '@/lib/queries/bag';
import { deriveSetStatus, formatForDisplay } from '@/lib/tz';
import { PhysicalBag } from '@/components/physical-bag';
import { BombaInline } from '@/components/bomba-badge';

/**
 * Rota `/sets/[id]` (FR-027). Visualização completa do set com:
 * - setlist ordenada (order de setTracks)
 * - bag física derivada (discos únicos + shelfLocation)
 * - briefing
 * - status derivado do eventDate (Rascunho/Agendado/Realizado)
 */
export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const { id } = await params;
  const setId = Number(id);
  if (!Number.isFinite(setId)) notFound();

  const set = await loadSet(user.id, setId);
  if (!set) notFound();

  const [trackRows, bag] = await Promise.all([
    listSetTracks(setId, user.id),
    derivePhysicalBag(user.id, setId),
  ]);

  const status = deriveSetStatus(set.eventDate);
  const statusLabel = { draft: 'Rascunho', scheduled: 'Agendado', done: 'Realizado' }[status];

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <section className="grid grid-cols-[1fr_auto] items-end gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-3 flex-wrap">
            <Link href="/sets" className="hover:text-ink transition-colors">
              ← Sets
            </Link>
            <span>·</span>
            <StatusChip status={status} label={statusLabel} />
            {set.eventDate ? <span>· {formatForDisplay(set.eventDate)}</span> : null}
            {set.location ? <span>· {set.location}</span> : null}
          </p>
          <h1 className="title-display text-[36px]">{set.name}</h1>
        </div>
        <Link
          href={`/sets/${set.id}/montar`}
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 rounded-sm hover:bg-accent transition-colors"
        >
          Editar set
        </Link>
      </section>

      {set.briefing ? (
        <section className="mb-12 pb-8 border-b border-line">
          <p className="eyebrow mb-3">Briefing</p>
          <p className="font-serif italic text-[22px] text-ink leading-relaxed max-w-[760px] whitespace-pre-wrap">
            {set.briefing}
          </p>
        </section>
      ) : null}

      <section className="grid grid-cols-[1fr_340px] gap-12 items-start">
        <div>
          <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
            <h2 className="font-serif italic text-[32px] font-medium tracking-tight">Setlist</h2>
            <span className="label-tech">
              {trackRows.length} {trackRows.length === 1 ? 'faixa' : 'faixas'}
            </span>
          </div>

          {trackRows.length === 0 ? (
            <p className="font-serif italic text-ink-mute text-center py-12">
              Nenhuma faixa neste set.{' '}
              <Link href={`/sets/${set.id}/montar`} className="text-accent hover:underline">
                Começar a montar →
              </Link>
            </p>
          ) : (
            <ol>
              {trackRows.map((t, i) => (
                <li
                  key={t.trackId}
                  className="grid grid-cols-[40px_48px_1fr_auto] gap-4 py-4 border-b border-line-soft items-center"
                >
                  <span className="font-mono text-[13px] text-ink-mute">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[13px] text-accent font-medium">
                    {t.position}
                  </span>
                  <div className="min-w-0">
                    <p className="font-serif italic text-[19px] leading-tight truncate">
                      {t.title}
                      {t.isBomb ? (
                        <span className="ml-2">
                          <BombaInline />
                        </span>
                      ) : null}
                    </p>
                    <p className="label-tech mt-0.5 truncate">
                      <Link
                        href={`/disco/${t.recordId}`}
                        className="hover:text-accent transition-colors"
                      >
                        {t.artist} · {t.recordTitle}
                      </Link>
                    </p>
                  </div>
                  <span className="label-tech whitespace-nowrap">
                    {t.bpm ? `${t.bpm} BPM` : ''}
                    {t.musicalKey ? ` · ${t.musicalKey}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <PhysicalBag bag={bag} totalTracks={trackRows.length} />
      </section>
    </div>
  );
}

function StatusChip({
  status,
  label,
}: {
  status: 'draft' | 'scheduled' | 'done';
  label: string;
}) {
  const cls = {
    draft: 'text-warn border-warn',
    scheduled: 'text-accent border-accent/60',
    done: 'text-ink-mute border-line',
  }[status];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border rounded-sm not-italic ${cls}`}
    >
      {label}
    </span>
  );
}
