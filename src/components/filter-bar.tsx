'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BombaFilter, type BombaFilterValue } from './bomba-filter';
import { FilterBottomSheet } from './filter-bottom-sheet';
import { FilterActiveChips, type ActiveFilter } from './filter-active-chips';
import { FilterPicker } from './filter-picker';
import { YearFilterPicker } from './year-filter-picker';
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
  // Inc 8 (032): 5 filtros novos + suas listas disponíveis (cached via user_vocab Inc 33).
  formats: string[];
  availableFormats: string[];
  shelves: string[];
  availableShelves: string[];
  years: number[];
  availableYears: number[];
  countries: string[];
  availableCountries: string[];
  labels: string[];
  availableLabels: string[];
  counts: {
    total: number;
    ativos: number;
    naoAvaliados: number;
    descartados: number;
  };
};

export function FilterBar(props: FilterBarProps) {
  const {
    status,
    text,
    genres,
    availableGenres,
    styles,
    availableStyles,
    bomba,
    formats,
    availableFormats,
    shelves,
    availableShelves,
    years,
    availableYears,
    countries,
    availableCountries,
    labels,
    availableLabels,
  } = props;

  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Pickers individuais (Q2=A — picker buttons + overlay).
  const [genrePickerOpen, setGenrePickerOpen] = useState(false);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [shelfPickerOpen, setShelfPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);

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

  function setMulti(paramKey: string, list: string[]) {
    startTransition(() => {
      const next = new URLSearchParams(params);
      next.delete(paramKey);
      for (const x of list) next.append(paramKey, x);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function setMultiInt(paramKey: string, list: number[]) {
    startTransition(() => {
      const next = new URLSearchParams(params);
      next.delete(paramKey);
      for (const x of list) next.append(paramKey, String(x));
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  // Handlers genéricos pra toggle multi-select.
  function makeToggle(paramKey: string, current: string[]) {
    return (value: string) => {
      const set = new Set(current);
      set.has(value) ? set.delete(value) : set.add(value);
      setMulti(paramKey, Array.from(set));
    };
  }

  function toggleYear(year: number) {
    const set = new Set(years);
    set.has(year) ? set.delete(year) : set.add(year);
    setMultiInt('year', Array.from(set));
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
    formats.length +
    shelves.length +
    years.length +
    countries.length +
    labels.length +
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
    ...formats.map((f) => ({
      id: `fmt-${f}`,
      label: f,
      onRemove: () => setMulti('format', formats.filter((x) => x !== f)),
    })),
    ...shelves.map((sh) => ({
      id: `sh-${sh}`,
      label: sh,
      onRemove: () => setMulti('shelf', shelves.filter((x) => x !== sh)),
    })),
    ...years.map((y) => ({
      id: `yr-${y}`,
      label: String(y),
      onRemove: () => setMultiInt('year', years.filter((x) => x !== y)),
    })),
    ...countries.map((c) => ({
      id: `ctry-${c}`,
      label: c,
      onRemove: () => setMulti('country', countries.filter((x) => x !== c)),
    })),
    ...labels.map((l) => ({
      id: `lbl-${l}`,
      label: l,
      onRemove: () => setMulti('label', labels.filter((x) => x !== l)),
    })),
  ];

  const innerContent = (
    <FilterContent
      {...props}
      isPending={isPending}
      onSetParam={setParam}
      onClearAll={clearAll}
      onOpenPicker={{
        genre: () => setGenrePickerOpen(true),
        style: () => setStylePickerOpen(true),
        format: () => setFormatPickerOpen(true),
        shelf: () => setShelfPickerOpen(true),
        year: () => setYearPickerOpen(true),
        country: () => setCountryPickerOpen(true),
        label: () => setLabelPickerOpen(true),
      }}
    />
  );

  // Listas pra pickers genéricos (string[] em vez de FacetCount[]).
  const availableGenresStr = availableGenres.map((g) => g.value);
  const availableStylesStr = availableStyles.map((s) => s.value);

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

      {/* Pickers — renderizados sempre via portal-aware components, abrem condicionalmente */}
      <FilterPicker
        label="Gênero"
        available={availableGenresStr}
        selected={genres}
        onToggle={makeToggle('genre', genres)}
        onClose={() => setGenrePickerOpen(false)}
        open={genrePickerOpen}
      />
      <FilterPicker
        label="Estilo"
        available={availableStylesStr}
        selected={styles}
        onToggle={makeToggle('style', styles)}
        onClose={() => setStylePickerOpen(false)}
        open={stylePickerOpen}
      />
      <FilterPicker
        label="Formato"
        available={availableFormats}
        selected={formats}
        onToggle={makeToggle('format', formats)}
        onClose={() => setFormatPickerOpen(false)}
        open={formatPickerOpen}
      />
      <FilterPicker
        label="Prateleira"
        available={availableShelves}
        selected={shelves}
        onToggle={makeToggle('shelf', shelves)}
        onClose={() => setShelfPickerOpen(false)}
        open={shelfPickerOpen}
      />
      <YearFilterPicker
        availableYears={availableYears}
        selectedYears={years}
        onToggle={toggleYear}
        onClose={() => setYearPickerOpen(false)}
        open={yearPickerOpen}
      />
      <FilterPicker
        label="País"
        available={availableCountries}
        selected={countries}
        onToggle={makeToggle('country', countries)}
        onClose={() => setCountryPickerOpen(false)}
        open={countryPickerOpen}
      />
      <FilterPicker
        label="Selo"
        available={availableLabels}
        selected={labels}
        onToggle={makeToggle('label', labels)}
        onClose={() => setLabelPickerOpen(false)}
        open={labelPickerOpen}
      />
    </>
  );
}

type FilterContentProps = FilterBarProps & {
  isPending: boolean;
  onSetParam: (key: string, value: string | null) => void;
  onClearAll: () => void;
  onOpenPicker: {
    genre: () => void;
    style: () => void;
    format: () => void;
    shelf: () => void;
    year: () => void;
    country: () => void;
    label: () => void;
  };
};

function FilterContent({
  status,
  text,
  genres,
  styles,
  bomba,
  counts,
  formats,
  shelves,
  years,
  countries,
  labels,
  onSetParam,
  onClearAll,
  onOpenPicker,
}: FilterContentProps) {
  const hasAnyFilter =
    status !== 'all' ||
    text.length > 0 ||
    genres.length > 0 ||
    styles.length > 0 ||
    formats.length > 0 ||
    shelves.length > 0 ||
    years.length > 0 ||
    countries.length > 0 ||
    labels.length > 0 ||
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

      {/* Inc 8 (032): picker buttons (Q2=A) — substituem lista expandida.
          Cada botão abre overlay/sheet com chips clicáveis. */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="label-tech text-ink-mute mr-1 shrink-0 hidden md:inline">filtrar por</span>
        <PickerButton label="Gênero" count={genres.length} onClick={onOpenPicker.genre} />
        <PickerButton label="Estilo" count={styles.length} onClick={onOpenPicker.style} />
        <PickerButton label="Formato" count={formats.length} onClick={onOpenPicker.format} />
        <PickerButton label="Prateleira" count={shelves.length} onClick={onOpenPicker.shelf} />
        <PickerButton label="Ano" count={years.length} onClick={onOpenPicker.year} />
        <PickerButton label="País" count={countries.length} onClick={onOpenPicker.country} />
        <PickerButton label="Selo" count={labels.length} onClick={onOpenPicker.label} />
      </div>
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

function PickerButton({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  const active = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 min-h-[40px] border rounded-sm transition-colors inline-flex items-center gap-1.5 ${
        active
          ? 'border-accent text-accent bg-accent/5'
          : 'border-line text-ink-soft hover:border-ink hover:text-ink'
      }`}
    >
      <span>{label}</span>
      {active ? (
        <span className="bg-accent text-paper rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px]">
          {count}
        </span>
      ) : null}
    </button>
  );
}
