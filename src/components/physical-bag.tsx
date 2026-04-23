import type { BagDisc } from '@/lib/queries/bag';
import { BombaInline } from './bomba-badge';

export function PhysicalBag({
  bag,
  totalTracks,
}: {
  bag: BagDisc[];
  totalTracks: number;
}) {
  return (
    <aside className="sticky top-28 border border-ink p-6 bg-paper-raised rounded-sm">
      <p className="eyebrow text-accent mb-2">Bag física</p>
      <p className="font-serif italic text-[48px] font-normal leading-none mb-2">
        {bag.length}
      </p>
      <p className="font-serif italic text-[13px] text-ink-soft">
        {totalTracks} {totalTracks === 1 ? 'faixa' : 'faixas'} · {bag.length}{' '}
        {bag.length === 1 ? 'disco único' : 'discos únicos'}
      </p>

      {bag.length > 0 ? (
        <>
          <div className="my-4 h-px bg-line" />
          <p className="label-tech mb-3">Discos a levar</p>
          <ul className="space-y-3">
            {bag.map((d) => (
              <li key={d.recordId} className="flex items-baseline gap-2">
                <span className="font-serif italic text-[15px] text-ink leading-tight flex-1 min-w-0">
                  <span className="truncate">{d.artist}</span>
                  <span className="text-ink-soft"> — {d.recordTitle}</span>
                  {d.hasBomb ? <span className="ml-1"><BombaInline /></span> : null}
                </span>
                {d.shelfLocation ? (
                  <span className="font-mono not-italic text-[10px] text-ink-mute tracking-wide whitespace-nowrap">
                    [{d.shelfLocation}]
                  </span>
                ) : (
                  <span className="font-mono not-italic text-[10px] text-warn tracking-wide whitespace-nowrap">
                    sem prateleira
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
