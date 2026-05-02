'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveTrackConflict } from '@/lib/actions';
import type { TrackConflict } from '@/lib/queries/status';
import { formatForDisplay } from '@/lib/tz';

export function ConflictRow({ conflict }: { conflict: TrackConflict }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'keep' | 'discard') {
    setIsPending(true);
    setError(null);
    try {
      const res = await resolveTrackConflict({ trackId: conflict.trackId, action });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsPending(false);
      setConfirmingDiscard(false);
    }
  }

  return (
    <li className="grid grid-cols-[48px_1fr_auto] gap-4 py-4 border-b border-line-soft items-center">
      <span className="font-mono text-[13px] text-accent font-medium">{conflict.position}</span>
      <div className="min-w-0">
        <p className="font-serif italic text-[17px] leading-tight truncate">
          {conflict.title}
        </p>
        <p className="label-tech truncate">
          <Link
            href={`/disco/${conflict.recordId}`}
            prefetch={false}
            className="hover:text-accent transition-colors"
          >
            {conflict.artist} · {conflict.recordTitle}
          </Link>
          {conflict.conflictDetectedAt ? (
            <span className="text-ink-mute"> · detectado {formatForDisplay(conflict.conflictDetectedAt)}</span>
          ) : null}
        </p>
        {error ? <p className="text-xs text-warn mt-1">{error}</p> : null}
      </div>
      <div className="flex gap-2 items-center">
        {confirmingDiscard ? (
          <>
            <span className="label-tech text-warn">Tem certeza?</span>
            <button
              type="button"
              onClick={() => act('discard')}
              disabled={isPending}
              className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 bg-warn text-paper rounded-sm hover:bg-warn/80 disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDiscard(false)}
              disabled={isPending}
              className="label-tech text-ink-mute hover:text-ink underline"
            >
              cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => act('keep')}
              disabled={isPending}
              className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-ok text-ok hover:bg-ok hover:text-paper rounded-sm disabled:opacity-50 transition-colors"
            >
              Manter no Sulco
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDiscard(true)}
              disabled={isPending}
              className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-warn text-warn hover:bg-warn hover:text-paper rounded-sm disabled:opacity-50 transition-colors"
            >
              Descartar
            </button>
          </>
        )}
      </div>
    </li>
  );
}
