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
    <aside className="sticky top-28 border border-ink p-6 bg-paper-raised rounded-sm">
      <div className="border-b border-ink pb-4 mb-5">
        <p className="eyebrow text-accent mb-2">Set em construção</p>
        <h2 className="font-serif italic text-[26px] font-medium tracking-tight leading-tight">
          {setName}
        </h2>
      </div>

      <div className="bg-ink text-paper p-4 rounded-sm mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent/80 mb-2">
          Bag física
        </p>
        <p className="font-serif italic text-[40px] font-normal leading-none">{uniqueRecords}</p>
        <p className="font-serif italic text-[13px] opacity-70 mt-2">
          {tracks.length} {tracks.length === 1 ? 'faixa' : 'faixas'} · {uniqueRecords}{' '}
          {uniqueRecords === 1 ? 'disco' : 'discos'}
        </p>
      </div>

      <SortableSetList setId={setId} tracks={tracks} />
    </aside>
  );
}
