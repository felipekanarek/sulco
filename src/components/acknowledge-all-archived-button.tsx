'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acknowledgeAllArchived } from '@/lib/actions';

export function AcknowledgeAllArchivedButton({ count }: { count: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (isPending) return;
    const ok = window.confirm(
      `Marcar todos os ${count} como reconhecidos?`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await acknowledgeAllArchived();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro inesperado.');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 min-h-[44px] border border-ink text-ink hover:bg-ink hover:text-paper rounded-sm disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {isPending ? 'Reconhecendo…' : 'Reconhecer tudo'}
      </button>
      {error ? (
        <p role="alert" className="font-mono text-[11px] text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}
