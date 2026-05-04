'use client';

import { useEffect, useState } from 'react';
import { MobileDrawer } from './mobile-drawer';

/**
 * Inc 8 (032) — picker específico para filtro de Ano.
 *
 * Q1=B (multi-select de décadas): chips com labels "60s", "70s", ..., "20s".
 * Apenas décadas com ≥1 record na coleção aparecem (passadas via prop).
 * Sem busca interna (~6-8 décadas no máximo).
 *
 * Mesmo padrão visual de `<FilterPicker>` mas estrutura simplificada.
 */
type DecadeFilterPickerProps = {
  availableDecades: number[]; // ex: [1960, 1970, 1980, 1990, 2000, 2010, 2020]
  selectedDecades: number[];
  onToggle: (decade: number) => void;
  onClose: () => void;
  open: boolean;
};

function decadeLabel(decade: number): string {
  // 1960 → "60s", 2020 → "20s"
  return `${String(decade % 100).padStart(2, '0')}s`;
}

export function DecadeFilterPicker({
  availableDecades,
  selectedDecades,
  onToggle,
  onClose,
  open,
}: DecadeFilterPickerProps) {
  const [isMobile, setIsMobile] = useState(false);

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

  if (!open) return null;

  const sortedDecades = [...availableDecades].sort((a, b) => a - b);

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

      <p className="label-tech text-ink-mute">selecione 1+ décadas</p>

      <div className="flex flex-wrap gap-2">
        {sortedDecades.length === 0 ? (
          <p className="font-mono text-[12px] text-ink-mute italic">
            Nenhuma década com discos.
          </p>
        ) : (
          sortedDecades.map((decade) => {
            const isSelected = selectedDecades.includes(decade);
            return (
              <button
                key={decade}
                type="button"
                onClick={() => onToggle(decade)}
                className={`font-mono text-[12px] px-4 py-2 min-h-[44px] border rounded-sm transition-colors ${
                  isSelected
                    ? 'bg-accent text-paper border-accent'
                    : 'bg-paper text-ink-soft border-line hover:border-accent hover:text-accent'
                }`}
                aria-pressed={isSelected}
              >
                {decadeLabel(decade)}
              </button>
            );
          })
        )}
      </div>

      {selectedDecades.length > 0 ? (
        <p className="label-tech text-ink-mute">
          {selectedDecades.length} {selectedDecades.length === 1 ? 'selecionada' : 'selecionadas'}
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
