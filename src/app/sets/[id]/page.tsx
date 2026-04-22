import Link from 'next/link';
import { db, sets, setTracks, tracks, records } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const setId = parseInt(id, 10);
  if (!Number.isFinite(setId)) notFound();

  const [set] = await db.select().from(sets).where(eq(sets.id, setId));
  if (!set) notFound();

  const setTracksList = await db
    .select({
      trackId: tracks.id,
      position: tracks.position,
      title: tracks.title,
      bpm: tracks.bpm,
      artist: records.artist,
      recordId: records.id,
      recordTitle: records.title,
      shelfLocation: records.shelfLocation,
      order: setTracks.order,
    })
    .from(setTracks)
    .innerJoin(tracks, eq(tracks.id, setTracks.trackId))
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(eq(setTracks.setId, setId))
    .orderBy(asc(setTracks.order));

  const uniqueRecords = new Set(setTracksList.map((t) => t.recordId));

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <section className="grid grid-cols-[1fr_auto] items-end gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2">
            <Link href="/sets" className="hover:text-ink">← Sets</Link> ·{' '}
            {formatDate(set.eventDate)} · {set.location ?? '—'}
          </p>
          <h1 className="title-display text-[36px]">{set.name}</h1>
        </div>
        <Link
          href={`/sets/${set.id}/montar`}
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 rounded-sm hover:bg-accent"
        >
          Editar set
        </Link>
      </section>

      {set.briefing && (
        <section className="mb-12 pb-8 border-b border-line">
          <p className="eyebrow mb-3">Briefing</p>
          <p className="font-serif italic text-[22px] text-ink leading-relaxed max-w-[760px]">
            {set.briefing}
          </p>
        </section>
      )}

      <section className="grid grid-cols-[1fr_320px] gap-12 items-start">
        <div>
          <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
            <h2 className="font-serif italic text-[32px] font-medium tracking-tight">Setlist</h2>
            <span className="label-tech">{setTracksList.length} faixas</span>
          </div>

          {setTracksList.length === 0 ? (
            <p className="font-serif italic text-ink-mute text-center py-12">
              Nenhuma faixa neste set. <Link href={`/sets/${set.id}/montar`} className="text-accent hover:underline">Começar a montar →</Link>
            </p>
          ) : (
            <ol>
              {setTracksList.map((t, i) => (
                <li key={t.trackId} className="grid grid-cols-[40px_40px_1fr_auto] gap-4 py-4 border-b border-line-soft items-center">
                  <span className="font-mono text-[13px] text-ink-mute">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[13px] text-accent font-medium">{t.position}</span>
                  <div>
                    <p className="font-serif italic text-[19px] leading-tight">{t.title}</p>
                    <p className="label-tech mt-0.5">
                      <Link href={`/disco/${t.recordId}`} className="hover:text-accent">
                        {t.artist} · {t.recordTitle}
                      </Link>
                    </p>
                  </div>
                  <span className="label-tech">{t.bpm ? `${t.bpm} BPM` : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="sticky top-28 border border-ink p-6 bg-paper-raised rounded-sm">
          <p className="eyebrow text-accent mb-2">Bag física</p>
          <p className="font-serif italic text-[48px] font-normal leading-none mb-2">
            {uniqueRecords.size}
          </p>
          <p className="font-serif italic text-[13px] text-ink-soft">
            {setTracksList.length} faixas · {uniqueRecords.size} discos únicos
          </p>

          {uniqueRecords.size > 0 && (
            <>
              <div className="my-4 h-px bg-line" />
              <p className="label-tech mb-3">Discos a levar</p>
              <ul className="space-y-2">
                {[...uniqueRecords].map((rid) => {
                  const sample = setTracksList.find((t) => t.recordId === rid)!;
                  return (
                    <li key={rid} className="font-serif italic text-[15px] text-ink">
                      {sample.artist} — <span className="text-ink-soft">{sample.recordTitle}</span>
                      {sample.shelfLocation && (
                        <span className="font-mono not-italic text-[10px] text-ink-mute tracking-wide ml-2">
                          [{sample.shelfLocation}]
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
