'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type ViewMode = 'lista' | 'grade';

/**
 * Alterna entre visualização de lista vertical (editorial, detalhada)
 * e grade por capa (Discogs-like, visual). Persiste em `?view=lista|grade`.
 */
export function ViewToggle({ value }: { value: ViewMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function setMode(mode: ViewMode) {
    const next = new URLSearchParams(params);
    if (mode === 'lista') next.delete('view');
    else next.set('view', mode);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Modo de visualização"
      className="inline-flex border border-line rounded-sm overflow-hidden"
    >
      <ToggleButton active={value === 'lista'} onClick={() => setMode('lista')}>
        Lista
      </ToggleButton>
      <ToggleButton active={value === 'grade'} onClick={() => setMode('grade')}>
        Grade
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
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
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 transition-colors ${
        active ? 'bg-ink text-paper' : 'bg-paper text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
