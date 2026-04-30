'use client';

import { useEffect, useState, useTransition } from 'react';
import { updateRecordStatus } from '@/lib/actions';

type RecordStatus = 'unrated' | 'active' | 'discarded';

type RecordStatusActionsProps = {
  recordId: number;
  status: RecordStatus;
  recordLabel: string;
  className?: string;
};

const BTN_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 min-h-[44px] md:min-h-[32px] border border-line hover:border-ink text-ink-soft hover:text-ink rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap';

export function RecordStatusActions({
  recordId,
  status,
  recordLabel,
  className,
}: RecordStatusActionsProps) {
  const [optimistic, setOptimistic] = useState<RecordStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reset optimistic quando o RSC re-renderiza com novo `status` prop
  // (revalidatePath sincroniza estado real após sucesso). Evita estado
  // local "preso" depois que o servidor já confirmou.
  useEffect(() => {
    setOptimistic(null);
  }, [status]);

  // Auto-dismiss do erro em 5s (Clarification Q2).
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const displayStatus = optimistic ?? status;

  function applyStatus(target: RecordStatus) {
    if (isPending) return;
    setError(null);
    setOptimistic(target);
    startTransition(async () => {
      try {
        const res = await updateRecordStatus({ recordId, status: target });
        if (!res.ok) {
          setOptimistic(null);
          setError(res.error || 'Falha ao atualizar — tente novamente.');
        }
      } catch (err) {
        setOptimistic(null);
        setError(err instanceof Error ? err.message : 'Erro inesperado.');
      }
    });
  }

  return (
    <div className={`flex flex-row flex-wrap items-center gap-2 ${className ?? ''}`}>
      {displayStatus === 'unrated' ? (
        <>
          <button
            type="button"
            onClick={() => applyStatus('active')}
            disabled={isPending}
            aria-label={`Ativar disco ${recordLabel}`}
            className={BTN_CLASS}
          >
            {isPending && optimistic === 'active' ? 'Salvando…' : 'Ativar'}
          </button>
          <button
            type="button"
            onClick={() => applyStatus('discarded')}
            disabled={isPending}
            aria-label={`Descartar disco ${recordLabel}`}
            className={BTN_CLASS}
          >
            {isPending && optimistic === 'discarded' ? 'Salvando…' : 'Descartar'}
          </button>
        </>
      ) : displayStatus === 'active' ? (
        <button
          type="button"
          onClick={() => applyStatus('discarded')}
          disabled={isPending}
          aria-label={`Descartar disco ${recordLabel}`}
          className={BTN_CLASS}
        >
          {isPending ? 'Salvando…' : 'Descartar'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => applyStatus('active')}
          disabled={isPending}
          aria-label={`Reativar disco ${recordLabel}`}
          className={BTN_CLASS}
        >
          {isPending ? 'Salvando…' : 'Reativar'}
        </button>
      )}
      {error ? (
        <p
          role="alert"
          className="font-mono text-[11px] text-warn ml-1 self-center"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
