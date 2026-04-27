'use client';

// 009 — chip-bar compacto exibindo filtros aplicados acima da lista (FR-008b).
// Usado em mobile junto com <FilterBottomSheet>.

export type ActiveFilter = {
  id: string;
  label: string;
  onRemove: () => void;
};

export function FilterActiveChips({ filters }: { filters: ActiveFilter[] }) {
  if (filters.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto py-2 px-1 -mx-1 scrollbar-thin">
      {filters.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] bg-paper-raised border border-line text-ink rounded-sm pl-2.5 pr-1 py-1 whitespace-nowrap shrink-0"
        >
          {f.label}
          <button
            type="button"
            onClick={f.onRemove}
            aria-label={`Remover filtro ${f.label}`}
            className="min-w-[28px] min-h-[28px] flex items-center justify-center text-ink-mute hover:text-accent transition-colors leading-none"
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      ))}
    </div>
  );
}
