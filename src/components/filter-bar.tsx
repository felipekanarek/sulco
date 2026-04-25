'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BombaFilter, type BombaFilterValue } from './bomba-filter';
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

export function FilterBar({
  status,
  text,
  genres,
  availableGenres,
  styles,
  availableStyles,
  bomba,
  counts,
}: FilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

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

  function toggleMulti(paramKey: 'genre' | 'style', current: Set<string>, value: string) {
    startTransition(() => {
      current.has(value) ? current.delete(value) : current.add(value);
      const next = new URLSearchParams(params);
      next.delete(paramKey);
      for (const x of current) next.append(paramKey, x);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }
  function toggleGenre(g: string) {
    toggleMulti('genre', new Set(genres), g);
  }
  function toggleStyle(s: string) {
    toggleMulti('style', new Set(styles), s);
  }

  function clearAll() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  const hasAnyFilter =
    status !== 'all' ||
    text.length > 0 ||
    genres.length > 0 ||
    styles.length > 0 ||
    bomba !== 'any';

  return (
    <section
      aria-label="Filtros da coleção"
      aria-busy={isPending ? 'true' : 'false'}
      className="flex flex-col gap-4 mb-8 pb-4"
    >
      <div className="grid grid-cols-[320px_1fr] gap-8 items-center">
        <label className="block">
          <span className="sr-only">Buscar por artista, título ou selo</span>
          <input
            type="search"
            defaultValue={text}
            onChange={(e) => setParam('q', e.target.value.trim() || null)}
            placeholder="Buscar por artista, título, selo…"
            className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[19px] italic placeholder:text-ink-mute outline-none focus:border-accent"
          />
        </label>

        <div className="flex gap-3 justify-end flex-wrap">
          <span className="label-tech text-ink-mute self-center mr-1">status</span>
          <Chip active={status === 'all'} onClick={() => setParam('status', 'all')}>
            Todos · {counts.total}
          </Chip>
          <Chip active={status === 'active'} onClick={() => setParam('status', 'active')}>
            Ativos · {counts.ativos}
          </Chip>
          <Chip active={status === 'unrated'} onClick={() => setParam('status', 'unrated')}>
            Não avaliados · {counts.naoAvaliados}
          </Chip>
          <Chip active={status === 'discarded'} onClick={() => setParam('status', 'discarded')}>
            Descartados · {counts.descartados}
          </Chip>
          <BombaFilter value={bomba} />
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={clearAll}
              className="label-tech text-ink-mute hover:text-accent underline self-center ml-2"
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
        onToggle={toggleGenre}
        activeCls="bg-accent/10 border-accent text-ink"
      />

      <FacetRow
        label="estilos (OU)"
        available={availableStyles}
        selected={styles}
        onToggle={toggleStyle}
        activeCls="bg-ok/10 border-ok text-ink"
      />
    </section>
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
  const [query, setQuery] = useState('');

  if (available.length === 0) return null;

  const selectedSet = new Set(selected);
  const selectedFacets = available.filter((f) => selectedSet.has(f.value));
  const unselected = available.filter((f) => !selectedSet.has(f.value));

  // Quando expandido com busca: filtra unselected por substring no value
  // (case-insensitive). Selected SEMPRE visível mesmo durante filtro.
  const q = query.trim().toLowerCase();
  const filteredUnselected =
    expanded && q.length > 0
      ? unselected.filter((f) => f.value.toLowerCase().includes(q))
      : unselected;

  const visibleUnselected = expanded
    ? filteredUnselected
    : filteredUnselected.slice(
        0,
        Math.max(0, COLLAPSED_COUNT - selectedFacets.length),
      );
  const visible = [...selectedFacets, ...visibleUnselected];
  const hidden = available.length - visible.length;
  const totalUnselected = unselected.length;
  const filteredOutCount =
    expanded && q.length > 0 ? totalUnselected - filteredUnselected.length : 0;

  function toggleExpanded() {
    setExpanded((v) => {
      if (v) setQuery(''); // limpa busca ao recolher
      return !v;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex gap-2 items-center ${expanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'}`}
      >
        <span className="label-tech text-ink-mute mr-1 shrink-0">{label}</span>
        <div
          className={`flex gap-2 ${expanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'}`}
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
                className={`font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1.5 border rounded-full transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? activeCls
                    : 'border-line text-ink-soft hover:border-ink hover:text-ink'
                }`}
              >
                <span>{f.value}</span>
                <span className="text-ink-mute">{f.count}</span>
              </button>
            );
          })}
          {expanded && q.length > 0 && filteredUnselected.length === 0 ? (
            <span className="font-mono text-[10px] text-ink-mute self-center">
              nenhum {label.replace(/\s*\(.*\)/, '')} casa com "{query}"
            </span>
          ) : null}
        </div>
        {hidden > 0 || expanded ? (
          <button
            type="button"
            onClick={toggleExpanded}
            className="label-tech text-ink-mute hover:text-accent underline shrink-0 ml-1"
          >
            {expanded ? 'recolher' : `+${hidden} mais`}
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="flex items-center gap-3 ml-[7.5rem]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filtrar ${label.replace(/\s*\(.*\)/, '')} (digite pra buscar)…`}
            className="bg-transparent border border-line rounded-full px-3 py-1 font-mono text-[11px] placeholder:text-ink-mute outline-none focus:border-accent w-72"
            autoFocus
          />
          {filteredOutCount > 0 ? (
            <span className="label-tech text-ink-mute">
              {filteredUnselected.length} de {totalUnselected} ({filteredOutCount} ocultos)
            </span>
          ) : null}
        </div>
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
      className={`font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 rounded-full border transition-colors ${
        active
          ? 'bg-ink text-paper border-ink'
          : 'border-line text-ink-soft hover:border-ink hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
