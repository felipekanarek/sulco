'use client';

import { useState, useTransition } from 'react';
import { enrichRecordOnDemand } from '@/lib/actions';

type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'success'; tracksUpdated: number; tracksSkipped: number }
  | { kind: 'error'; message: string };

/**
 * Botão "Buscar sugestões de audio features" em `/disco/[id]`.
 *
 * Aparece quando o disco ainda não teve sugestões buscadas — ou o DJ
 * quer re-tentar. Chama Server Action que dispara a cadeia
 * Discogs→MusicBrainz→AcousticBrainz e revalida a página ao fim.
 *
 * Latência esperada: 5-15s (MB rate limit 1 req/s + N faixas no AB).
 */
export function EnrichRecordButton({
  recordId,
  alreadyAttempted,
}: {
  recordId: number;
  /** Se o disco já teve pelo menos 1 tentativa (tracks.audio_features_synced_at !== NULL). */
  alreadyAttempted: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>({ kind: 'idle' });

  function run() {
    setFeedback({ kind: 'idle' });
    startTransition(async () => {
      const res = await enrichRecordOnDemand({ recordId });
      if (res.ok) {
        setFeedback({
          kind: 'success',
          tracksUpdated: res.data?.tracksUpdated ?? 0,
          tracksSkipped: res.data?.tracksSkipped ?? 0,
        });
      } else {
        setFeedback({ kind: 'error', message: res.error });
      }
    });
  }

  const label = alreadyAttempted
    ? 'Tentar buscar sugestões de novo'
    : 'Buscar sugestões de audio features';

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Buscando… (pode levar até 15s)' : label}
      </button>
      {feedback.kind === 'success' ? (
        <p className="font-serif italic text-[13px] text-ok">
          {feedback.tracksUpdated === 0
            ? 'Nenhuma faixa tinha dados externos disponíveis.'
            : `${feedback.tracksUpdated} faixa${feedback.tracksUpdated === 1 ? '' : 's'} enriquecida${feedback.tracksUpdated === 1 ? '' : 's'}.${feedback.tracksSkipped > 0 ? ` (${feedback.tracksSkipped} sem dados)` : ''}`}
        </p>
      ) : null}
      {feedback.kind === 'error' ? (
        <p className="font-serif italic text-[13px] text-warn">{feedback.message}</p>
      ) : null}
    </div>
  );
}
