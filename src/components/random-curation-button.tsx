'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pickRandomUnratedRecord } from '@/lib/actions';

type RandomFilters = {
  text?: string;
  genres?: string[];
  styles?: string[];
  bomba?: 'any' | 'only' | 'none';
};

/**
 * Botão "Curar disco aleatório" (006 + 011).
 *
 * Sorteia 1 record `unrated` do acervo do DJ e redireciona pra
 * `/disco/[id]`. Quando 0 elegíveis, mostra mensagem inline sem
 * navegar.
 *
 * Inc 011: aceita prop `filters` (text, genres, styles, bomba) que
 * é repassada à Server Action. Quando há filtros ativos e o sorteio
 * volta vazio, exibe mensagem contextual em vez da global.
 */
export function RandomCurationButton({
  className = '',
  label = 'Curar disco aleatório',
  filters,
}: {
  className?: string;
  label?: string;
  filters?: RandomFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emptyContext, setEmptyContext] = useState<'global' | 'filtered' | null>(
    null,
  );

  const hasActiveFilters = !!(
    (filters?.text && filters.text.trim().length > 0) ||
    (filters?.genres && filters.genres.length > 0) ||
    (filters?.styles && filters.styles.length > 0) ||
    (filters?.bomba && filters.bomba !== 'any')
  );

  function pick() {
    setEmptyContext(null);
    startTransition(async () => {
      const res = await pickRandomUnratedRecord(hasActiveFilters ? filters : undefined);
      if (res.ok && res.data?.recordId) {
        router.push(`/disco/${res.data.recordId}`);
      } else if (res.ok) {
        setEmptyContext(hasActiveFilters ? 'filtered' : 'global');
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={pick}
        disabled={isPending}
        className={`font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isPending ? 'Sorteando…' : `🎲 ${label}`}
      </button>
      {emptyContext === 'filtered' ? (
        <p className="font-serif italic text-[13px] text-ink-mute">
          Nenhum disco unrated com esses filtros.
        </p>
      ) : emptyContext === 'global' ? (
        <p className="font-serif italic text-[13px] text-ink-mute">
          Não há discos pra triar — todos já foram avaliados.
        </p>
      ) : null}
    </div>
  );
}
