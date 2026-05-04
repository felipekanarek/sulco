'use client';

import { useEffect, useMemo, useState } from 'react';
import { MobileDrawer } from './mobile-drawer';

/**
 * Inc 8 follow-up — picker específico para filtro de Ano (multi-select).
 *
 * Substitui DecadeFilterPicker. Chips com anos individuais (4 dígitos).
 * Apenas anos com ≥1 record na coleção aparecem (passados via prop).
 * Busca interna ativa quando ≥20 anos (DJ pode digitar "198" pra filtrar).
 */
type YearFilterPickerProps = {
  availableYears: number[];
  selectedYears: number[];
  onToggle: (year: number) => void;
  onClose: () => void;
  open: boolean;
};

const SEARCH_THRESHOLD = 20;

export function YearFilterPicker({
  availableYears,
  selectedYears,
  onToggle,
  onClose,
  open,
}: YearFilterPickerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!open || isMobile) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isMobile, onClose]);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const showSearch = availableYears.length > SEARCH_THRESHOLD;
  const filtered = useMemo(() => {
    if (!showSearch || query.trim().length === 0) return availableYears;
    const q = query.trim();
    return availableYears.filter((y) => String(y).includes(q));
  }, [availableYears, query, showSearch]);

  if (!open) return null;

  const content = (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif italic text-[20px] md:text-[22px] tracking-tight">
          Filtrar por ano
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent min-h-[44px] px-3"
          aria-label="Fechar picker"
        >
          Fechar
        </button>
      </div>

      {showSearch ? (
        <input
          type="text"
          inputMode="numeric"
          placeholder="Buscar ano…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full font-mono text-[13px] border border-line bg-paper px-3 py-2 min-h-[44px] focus:outline-none focus:border-accent"
          autoFocus
        />
      ) : null}

      <div className="flex flex-wrap gap-2 max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="font-mono text-[12px] text-ink-mute italic">
            Nenhum ano encontrado.
          </p>
        ) : (
          filtered.map((year) => {
            const isSelected = selectedYears.includes(year);
            return (
              <button
                key={year}
                type="button"
                onClick={() => onToggle(year)}
                className={`font-mono text-[12px] px-3 py-2 min-h-[44px] border rounded-sm transition-colors ${
                  isSelected
                    ? 'bg-accent text-paper border-accent'
                    : 'bg-paper text-ink-soft border-line hover:border-accent hover:text-accent'
                }`}
                aria-pressed={isSelected}
              >
                {year}
              </button>
            );
          })
        )}
      </div>

      {selectedYears.length > 0 ? (
        <p className="label-tech text-ink-mute">
          {selectedYears.length} {selectedYears.length === 1 ? 'selecionado' : 'selecionados'}
        </p>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <MobileDrawer
        open={open}
        onClose={onClose}
        side="bottom"
        ariaLabel="Filtrar por ano"
      >
        {content}
      </MobileDrawer>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center pt-20"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Filtrar por ano"
    >
      <div className="absolute inset-0 bg-ink/20" aria-hidden="true" />
      <div
        className="relative bg-paper border border-line shadow-lg rounded-sm max-w-[480px] w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
