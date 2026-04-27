'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BombaFilter, type BombaFilterValue } from './bomba-filter';
import { FilterBottomSheet } from './filter-bottom-sheet';
import { FilterActiveChips, type ActiveFilter } from './filter-active-chips';
import type { FacetCount } from '@/lib/queries/collection';

export type StatusFilter = 'all' | 'unrated' | 'active' | 'discarded';

export type FilterBarProps = {
  status: StatusFilter;
  text: string;
  genres: string[];
  availableGenres: FacetCount[];
  styles: string[];
  availableStyles: FacetCount[];
  bomba: BombaFilterValue;
  counts: {
    total: number;
    ativos: number;
    naoAvaliados: number;
    descartados: number;
  };
};

const COLLAPSED_COUNT = 10;

export function FilterBar(props: FilterBarProps) {
  const { status, text, genres, styles, bomba } = props;
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  function setParam(key: string, value: string | null) {
    startTransition(() => {
      const next = new URLSearchParams(params);
      if (value === null || value === '' || value === 'all' || value === 'any') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function setMulti(paramKey: 'genre' | 'style', list: string[]) {
    startTransition(() => {
      const next = new URLSearchParams(params);
      next.delete(paramKey);
      for (const x of list) next.append(paramKey, x);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function toggleGenre(g: string) {
    const set = new Set(genres);
    set.has(g) ? set.delete(g) : set.add(g);
    setMulti('genre', Array.from(set));
  }
  function toggleStyle(s: string) {
    const set = new Set(styles);
    set.has(s) ? set.delete(s) : set.add(s);
    setMulti('style', Array.from(set));
  }

  function clearAll() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  const activeFilterCount =
    (status !== 'all' ? 1 : 0) +
    (text.length > 0 ? 1 : 0) +
    genres.length +
    styles.length +
    (bomba !== 'any' ? 1 : 0);

  const activeChips: ActiveFilter[] = [
    ...(status !== 'all'
      ? [{ id: `status-${status}`, label: status, onRemove: () => setParam('status', null) }]
      : []),
    ...(bomba !== 'any'
      ? [
          {
            id: `bomba-${bomba}`,
            label: bomba === 'only' ? 'só bombas' : 'sem bombas',
            onRemove: () => setParam('bomba', null),
          },
        ]
      : []),
    ...genres.map((g) => ({
      id: `g-${g}`,
      label: g,
      onRemove: () => setMulti('genre', genres.filter((x) => x !== g)),
    })),
    ...styles.map((s) => ({
      id: `s-${s}`,
      label: s,
      onRemove: () => setMulti('style', styles.filter((x) => x !== s)),
    })),
  ];

  const innerContent = (
    <FilterContent
      {...props}
      isPending={isPending}
      onSetParam={setParam}
      onToggleGenre={toggleGenre}
      onToggleStyle={toggleStyle}
      onClearAll={clearAll}
    />
  );

  return (
    <>
      {/* Desktop: inline acima da lista (preservado) */}
      <section
        aria-label="Filtros da coleção"
        aria-busy={isPending ? 'true' : 'false'}
        className="hidden md:flex flex-col gap-4 mb-8 pb-4"
      >
        {innerContent}
      </section>

      {/* Mobile: botão "Filtros (N)" + chip-bar de filtros aplicados */}
      <section
        aria-label="Filtros da coleção"
        className="md:hidden mb-4 pb-2"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink text-ink px-4 py-2 min-h-[44px] rounded-sm hover:bg-ink hover:text-paper transition-colors flex items-center gap-2"
          >
            Filtros
            {activeFilterCount > 0 ? (
              <span className="bg-accent text-paper rounded-full px-1.5 min-w-[20px] h-5 flex items-center justify-center text-[10px]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="label-tech text-ink-mute hover:text-accent underline"
            >
              limpar
            </button>
          ) : null}
        </div>
        <FilterActiveChips filters={activeChips} />
      </section>

      <FilterBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onApply={() => setSheetOpen(false)}
        activeFilterCount={activeFilterCount}
      >
        {innerContent}
      </FilterBottomSheet>
    </>
  );
}

type FilterContentProps = FilterBarProps & {
  isPending: boolean;
  onSetParam: (key: string, value: string | null) => void;
  onToggleGenre: (g: string) => void;
  onToggleStyle: (s: string) => void;
  onClearAll: () => void;
};

function FilterContent({
  status,
  text,
  genres,
  availableGenres,
  styles,
  availableStyles,
  bomba,
  counts,
  onSetParam,
  onToggleGenre,
  onToggleStyle,
  onClearAll,
}: FilterContentProps) {
  const hasAnyFilter =
    status !== 'all' ||
    text.length > 0 ||
    genres.length > 0 ||
    styles.length > 0 ||
    bomba !== 'any';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:grid md:grid-cols-[320px_1fr] gap-4 md:gap-8 md:items-center">
        <label className="block">
          <span className="sr-only">Buscar por artista, título ou selo</span>
          <input
            type="search"
            defaultValue={text}
            onChange={(e) => onSetParam('q', e.target.value.trim() || null)}
            placeholder="Buscar por artista, título, selo…"
            className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[17px] md:text-[19px] italic placeholder:text-ink-mute outline-none focus:border-accent"
          />
        </label>

        <div className="flex gap-2 md:gap-3 md:justify-end flex-wrap">
          <span className="label-tech text-ink-mute self-center mr-1 hidden md:inline">status</span>
          <Chip active={status === 'all'} onClick={() => onSetParam('status', 'all')}>
            Todos · {counts.total}
          </Chip>
          <Chip active={status === 'active'} onClick={() => onSetParam('status', 'active')}>
            Ativos · {counts.ativos}
          </Chip>
          <Chip active={status === 'unrated'} onClick={() => onSetParam('status', 'unrated')}>
            Não aval. · {counts.naoAvaliados}
          </Chip>
          <Chip active={status === 'discarded'} onClick={() => onSetParam('status', 'discarded')}>
            Descart. · {counts.descartados}
          </Chip>
          <BombaFilter value={bomba} />
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={onClearAll}
              className="label-tech text-ink-mute hover:text-accent underline self-center ml-2 hidden md:inline-block"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      <FacetRow
        label="gêneros (OU)"
        available={availableGenres}
        selected={genres}
        onToggle={onToggleGenre}
        activeCls="bg-accent/10 border-accent text-ink"
      />

      <FacetRow
        label="estilos (OU)"
        available={availableStyles}
        selected={styles}
        onToggle={onToggleStyle}
        activeCls="bg-ok/10 border-ok text-ink"
      />
    </div>
  );
}

function FacetRow({
  label,
  available,
  selected,
  onToggle,
  activeCls,
}: {
  label: string;
  available: FacetCount[];
  selected: string[];
  onToggle: (value: string) => void;
  activeCls: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (available.length === 0) return null;

  // Mantém selecionados sempre visíveis (mesmo se caem fora do top-N).
  const selectedSet = new Set(selected);
  const selectedFacets = available.filter((f) => selectedSet.has(f.value));
  const unselected = available.filter((f) => !selectedSet.has(f.value));
  const visibleUnselected = expanded
    ? unselected
    : unselected.slice(0, Math.max(0, COLLAPSED_COUNT - selectedFacets.length));
  const visible = [...selectedFacets, ...visibleUnselected];
  const hidden = available.length - visible.length;

  return (
    <div
      className={`flex gap-2 items-start md:items-center flex-col md:flex-row ${expanded ? '' : ''}`}
    >
      <span className="label-tech text-ink-mute mr-1 shrink-0">{label}</span>
      <div
        className={`flex gap-2 ${expanded ? 'flex-wrap' : 'flex-wrap md:flex-nowrap md:overflow-hidden'}`}
      >
        {visible.map((f) => {
          const active = selectedSet.has(f.value);
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(f.value)}
              title={`${f.count} ${f.count === 1 ? 'disco' : 'discos'}`}
              className={`font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1.5 min-h-[36px] border rounded-full transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                active ? activeCls : 'border-line text-ink-soft hover:border-ink hover:text-ink active:border-ink active:text-ink'
              }`}
            >
              <span>{f.value}</span>
              <span className="text-ink-mute">{f.count}</span>
            </button>
          );
        })}
      </div>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="label-tech text-ink-mute hover:text-accent underline shrink-0 ml-1"
        >
          {expanded ? 'recolher' : `+${hidden} mais`}
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 min-h-[40px] rounded-full border transition-colors ${
        active
          ? 'bg-ink text-paper border-ink'
          : 'border-line text-ink-soft hover:border-ink hover:text-ink active:border-ink active:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
