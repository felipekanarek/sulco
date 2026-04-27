import { SortableSetList, type SortableItem } from './sortable-set-list';

export function SetSidePanel({
  setId,
  setName,
  tracks,
  uniqueRecords,
}: {
  setId: number;
  setName: string;
  tracks: SortableItem[];
  uniqueRecords: number;
}) {
  return (
    <aside className="md:sticky md:top-28 border border-ink p-4 md:p-6 bg-paper-raised rounded-sm">
      <div className="border-b border-ink pb-3 md:pb-4 mb-4 md:mb-5">
        <p className="eyebrow text-accent mb-2">Set em construção</p>
        <h2 className="font-serif italic text-[22px] md:text-[26px] font-medium tracking-tight leading-tight">
          {setName}
        </h2>
      </div>

      <div className="bg-ink text-paper p-4 rounded-sm mb-4 flex md:block items-baseline gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent/80 mb-0 md:mb-2">
          Bag física
        </p>
        <p className="font-serif italic text-[32px] md:text-[40px] font-normal leading-none">{uniqueRecords}</p>
        <p className="font-serif italic text-[13px] opacity-70 md:mt-2">
          {tracks.length} {tracks.length === 1 ? 'faixa' : 'faixas'} · {uniqueRecords}{' '}
          {uniqueRecords === 1 ? 'disco' : 'discos'}
        </p>
      </div>

      {/* Mobile: lista de faixas colapsável (evita parede com bags grandes).
          Desktop: sempre expandida. */}
      <details className="md:hidden group">
        <summary className="cursor-pointer flex items-center justify-between px-1 py-2 min-h-[44px] font-mono text-[11px] uppercase tracking-[0.12em] text-ink hover:text-accent">
          <span>
            Ver faixas{tracks.length > 0 ? ` (${tracks.length})` : ''}
          </span>
          <span aria-hidden="true" className="text-[14px] group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="mt-3">
          <SortableSetList setId={setId} tracks={tracks} />
        </div>
      </details>
      <div className="hidden md:block">
        <SortableSetList setId={setId} tracks={tracks} />
      </div>
    </aside>
  );
}
