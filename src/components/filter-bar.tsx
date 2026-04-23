'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { BombaFilter, type BombaFilterValue } from './bomba-filter';

export type StatusFilter = 'all' | 'unrated' | 'active' | 'discarded';

export type FilterBarProps = {
  status: StatusFilter;
  text: string;
  genres: string[];
  availableGenres: string[];
  styles: string[];
  availableStyles: string[];
  bomba: BombaFilterValue;
  counts: {
    total: number;
    ativos: number;
    naoAvaliados: number;
    descartados: number;
  };
};

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

      {availableGenres.length > 0 ? (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="label-tech text-ink-mute mr-1">gêneros (E)</span>
          {availableGenres.map((g) => {
            const active = genres.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={active}
                onClick={() => toggleGenre(g)}
                className={`font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1.5 border rounded-full transition-colors ${
                  active
                    ? 'bg-accent/10 border-accent text-ink'
                    : 'border-line text-ink-soft hover:border-ink hover:text-ink'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      ) : null}

      {availableStyles.length > 0 ? (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="label-tech text-ink-mute mr-1">estilos (E)</span>
          {availableStyles.map((s) => {
            const active = styles.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStyle(s)}
                className={`font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1.5 border rounded-full transition-colors ${
                  active
                    ? 'bg-ok/10 border-ok text-ink'
                    : 'border-line text-ink-soft hover:border-ink hover:text-ink'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
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
