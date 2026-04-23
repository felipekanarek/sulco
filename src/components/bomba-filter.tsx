'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type BombaFilterValue = 'any' | 'only' | 'none';

const LABELS: Record<BombaFilterValue, string> = {
  any: 'qualquer',
  only: 'apenas Bomba',
  none: 'sem Bomba',
};

const NEXT: Record<BombaFilterValue, BombaFilterValue> = {
  any: 'only',
  only: 'none',
  none: 'any',
};

/**
 * Toggle tri-estado que cicla entre `qualquer → apenas Bomba → sem Bomba`.
 * FR-006 (listagem) e FR-024 (montagem — futuro). Rótulos uniformes
 * (FR-022: "qualquer / apenas Bomba / sem Bomba").
 *
 * Persiste no query param `bomba=any|only|none` (omite quando `any`).
 */
export function BombaFilter({
  value,
  paramName = 'bomba',
}: {
  value: BombaFilterValue;
  paramName?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function cycle() {
    const next = NEXT[value];
    const newParams = new URLSearchParams(params);
    if (next === 'any') {
      newParams.delete(paramName);
    } else {
      newParams.set(paramName, next);
    }
    const qs = newParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value !== 'any'}
      aria-label={`Filtro Bomba: ${LABELS[value]}. Clique para alternar.`}
      onClick={cycle}
      className={`label-tech px-3 py-2 border transition-colors inline-flex items-center gap-2 ${badgeStyle(value)}`}
    >
      <span className="text-base leading-none">💣</span>
      <span>{LABELS[value]}</span>
    </button>
  );
}

function badgeStyle(v: BombaFilterValue): string {
  if (v === 'only') return 'bg-accent/10 border-accent text-ink';
  if (v === 'none') return 'bg-ink-mute/10 border-ink-mute text-ink-soft';
  return 'bg-paper-raised border-line text-ink-mute hover:border-ink-mute';
}
