'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pickRandomUnratedRecord } from '@/lib/actions';

/**
 * Botão "Curar disco aleatório" (006).
 *
 * Sorteia 1 record `unrated` do acervo do DJ e redireciona pra
 * `/disco/[id]`. Quando 0 elegíveis, mostra mensagem inline sem
 * navegar.
 */
export function RandomCurationButton({
  className = '',
  label = 'Curar disco aleatório',
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emptyState, setEmptyState] = useState(false);

  function pick() {
    setEmptyState(false);
    startTransition(async () => {
      const res = await pickRandomUnratedRecord();
      if (res.ok && res.data?.recordId) {
        router.push(`/disco/${res.data.recordId}`);
      } else if (res.ok) {
        setEmptyState(true);
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
      {emptyState ? (
        <p className="font-serif italic text-[13px] text-ink-mute">
          Não há discos pra triar — todos já foram avaliados.
        </p>
      ) : null}
    </div>
  );
}
