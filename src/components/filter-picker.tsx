'use client';

import { useEffect, useMemo, useState } from 'react';
import { MobileDrawer } from './mobile-drawer';

/**
 * Inc 8 (032) — picker genérico chip-based para filtros multi-select.
 *
 * Reusa pra: Gênero, Estilo, Formato, Prateleira, País, Selo.
 * Variante específica `<DecadeFilterPicker>` (não-generic) cobre Ano.
 *
 * UX:
 * - Mobile (≤640px): renderiza dentro de `<MobileDrawer side="bottom">`.
 * - Desktop: popover absoluto fixed positioned, fecha em click fora ou ESC.
 * - Busca textual interna condicional (Q3=B): aparece quando available.length > 20.
 * - Chips clicáveis com estado visual (selected/unselected).
 */
type FilterPickerProps = {
  label: string;
  available: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClose: () => void;
  open: boolean;
};

const SEARCH_THRESHOLD = 20;

export function FilterPicker({
  label,
  available,
  selected,
  onToggle,
  onClose,
  open,
}: FilterPickerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [query, setQuery] = useState('');

  // Detecta viewport (Inc 21 ShelfPicker / Bug 15 pattern).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ESC fecha (apenas desktop — MobileDrawer já tem ESC próprio).
  useEffect(() => {
    if (!open || isMobile) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isMobile, onClose]);

  // Reset busca ao reabrir.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const showSearch = available.length > SEARCH_THRESHOLD;
  const filtered = useMemo(() => {
    if (!showSearch || query.trim().length === 0) return available;
    const q = query.toLowerCase();
    return available.filter((v) => v.toLowerCase().includes(q));
  }, [available, query, showSearch]);

  if (!open) return null;

  const content = (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif italic text-[20px] md:text-[22px] tracking-tight">
          Filtrar por {label.toLowerCase()}
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
          placeholder={`Buscar ${label.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full font-mono text-[13px] border border-line bg-paper px-3 py-2 min-h-[44px] focus:outline-none focus:border-accent"
          autoFocus
        />
      ) : null}

      <div className="flex flex-wrap gap-2 max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="font-mono text-[12px] text-ink-mute italic">
            Nenhum resultado.
          </p>
        ) : (
          filtered.map((value) => {
            const isSelected = selected.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => onToggle(value)}
                className={`font-mono text-[12px] px-3 py-2 min-h-[44px] border rounded-sm transition-colors ${
                  isSelected
                    ? 'bg-accent text-paper border-accent'
                    : 'bg-paper text-ink-soft border-line hover:border-accent hover:text-accent'
                }`}
                aria-pressed={isSelected}
              >
                {value}
              </button>
            );
          })
        )}
      </div>

      {selected.length > 0 ? (
        <p className="label-tech text-ink-mute">
          {selected.length} {selected.length === 1 ? 'selecionado' : 'selecionados'}
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
        ariaLabel={`Filtrar por ${label.toLowerCase()}`}
      >
        {content}
      </MobileDrawer>
    );
  }

  // Desktop: overlay com popover.
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center pt-20"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Filtrar por ${label.toLowerCase()}`}
    >
      <div
        className="absolute inset-0 bg-ink/20"
        aria-hidden="true"
      />
      <div
        className="relative bg-paper border border-line shadow-lg rounded-sm max-w-[600px] w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
