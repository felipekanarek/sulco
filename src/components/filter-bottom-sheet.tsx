'use client';

import type { ReactNode } from 'react';
import { MobileDrawer } from './mobile-drawer';

// 009 — bottom sheet pra filtros multi-facet (FR-008/008a).
// Reutilizado em /sets/[id]/montar e na home /.

type FilterBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  activeFilterCount: number;
  onApply: () => void;
};

export function FilterBottomSheet({
  open,
  onClose,
  children,
  activeFilterCount,
  onApply,
}: FilterBottomSheetProps) {
  return (
    <MobileDrawer
      open={open}
      onClose={onClose}
      side="bottom"
      ariaLabel="Filtros"
    >
      {/* topo com handle visual + título + close */}
      <div className="flex flex-col items-center pt-2 pb-1 border-b border-line-soft">
        <div
          aria-hidden="true"
          className="w-10 h-1 bg-line rounded-full mb-2"
        />
        <div className="w-full px-5 pb-2 flex items-center justify-between">
          <h2 className="font-serif italic text-[20px] font-medium">
            Filtros
            {activeFilterCount > 0 ? (
              <span className="ml-2 font-mono text-[12px] text-accent">
                ({activeFilterCount})
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar filtros"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-mute hover:text-ink transition-colors"
          >
            <span aria-hidden="true" className="text-[22px] leading-none">×</span>
          </button>
        </div>
      </div>

      {/* conteúdo scrollável */}
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

      {/* rodapé sticky com Aplicar */}
      <div className="border-t border-line bg-paper px-5 py-3">
        <button
          type="button"
          onClick={onApply}
          className="w-full min-h-[48px] bg-ink text-paper font-mono text-[12px] uppercase tracking-[0.14em] rounded-sm hover:bg-accent transition-colors"
        >
          Aplicar
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
    </MobileDrawer>
  );
}
