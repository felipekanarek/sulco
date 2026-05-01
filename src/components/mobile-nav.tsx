'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MobileDrawer } from './mobile-drawer';

// 009 — drawer da navegação principal (FR-007/007a).
// Trigger e drawer co-localizados; estado interno via useState.

export function MobileNavTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu de navegação"
        aria-expanded={open}
        className={`min-w-[44px] min-h-[44px] flex items-center justify-center text-ink hover:text-accent transition-colors ${
          className ?? ''
        }`}
      >
        <span aria-hidden="true" className="text-[22px] leading-none">☰</span>
      </button>
      <MobileNav open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <MobileDrawer
      open={open}
      onClose={onClose}
      side="left"
      ariaLabel="Menu de navegação"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <span className="font-serif italic text-[22px] font-medium tracking-tight">
          Sulco<span className="text-accent not-italic">.</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar menu"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-mute hover:text-ink transition-colors"
        >
          <span aria-hidden="true" className="text-[22px] leading-none">×</span>
        </button>
      </div>

      <nav className="flex flex-col flex-1 overflow-y-auto">
        <NavItem href="/" onClick={onClose}>
          Coleção
        </NavItem>
        <NavItem href="/sets" onClick={onClose}>
          Sets
        </NavItem>
        <NavItem href="/curadoria" onClick={onClose}>
          Curadoria
        </NavItem>
        <NavItem href="/status" onClick={onClose}>
          Sync
        </NavItem>
        <NavItem href="/conta" onClick={onClose}>
          Conta
        </NavItem>
      </nav>
    </MobileDrawer>
  );
}

function NavItem({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onClick}
      className="font-serif italic text-[22px] px-5 py-4 min-h-[56px] border-b border-line-soft text-ink hover:bg-paper-raised hover:text-accent transition-colors flex items-center"
    >
      {children}
    </Link>
  );
}
