'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// 009 — primitiva genérica de drawer/bottom sheet.
// Usada por <MobileNav> (side="left") e <FilterBottomSheet> (side="bottom").
// Renderiza via portal em document.body para escapar de containing blocks
// criados por ancestrais com backdrop-filter, transform, filter etc.

type Side = 'left' | 'right' | 'bottom';

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  side: Side;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
};

const SIDE_CLOSED: Record<Side, string> = {
  left: '-translate-x-full',
  right: 'translate-x-full',
  bottom: 'translate-y-full',
};

const SIDE_PANEL: Record<Side, string> = {
  left: 'top-0 left-0 h-full w-[75%] max-w-[320px]',
  right: 'top-0 right-0 h-full w-[75%] max-w-[320px]',
  bottom:
    'bottom-0 left-0 right-0 max-h-[80vh] rounded-t-lg pb-[env(safe-area-inset-bottom)]',
};

export function MobileDrawer({
  open,
  onClose,
  side,
  ariaLabel,
  children,
  className,
}: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal só monta no client (SSR-safe).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Body scroll lock + foco salvo/restaurado.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  // ESC fecha.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Foco no painel ao abrir (para que ESC funcione e screen reader anuncie).
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`absolute bg-paper shadow-xl outline-none transition-transform duration-200 ease-out flex flex-col normal-case tracking-normal text-ink ${
          SIDE_PANEL[side]
        } ${open ? 'translate-x-0 translate-y-0' : SIDE_CLOSED[side]} ${
          className ?? ''
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
