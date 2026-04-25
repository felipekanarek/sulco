'use client';

import { useEffect, useState, useTransition } from 'react';
import { enrichRecordOnDemand } from '@/lib/actions';

type FeedbackState =
  | { kind: 'idle' }
  | {
      kind: 'success';
      totalTracks: number;
      tracksAlreadyProcessed: number;
      tracksUpdated: number;
      tracksSkipped: number;
    }
  | { kind: 'error'; message: string };

const COOLDOWN_MS = 10_000;

/**
 * Botão "Buscar sugestões de audio features" em `/disco/[id]`.
 *
 * Aparece quando o disco ainda não teve sugestões buscadas — ou o DJ
 * quer re-tentar. Chama Server Action que dispara a cadeia
 * Discogs→MusicBrainz→AcousticBrainz e revalida a página ao fim.
 *
 * Latência esperada: 5-15s (MB rate limit 1 req/s + N faixas no AB).
 * Debounce de 10s após cada clique evita re-spawns acidentais (DJ
 * impaciente clicando múltiplas vezes vê o mesmo enrich rodando).
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
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Ticker pra atualizar cooldown remaining na label
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [cooldownUntil]);

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const disabled = isPending || cooldownRemaining > 0;

  function run() {
    setFeedback({ kind: 'idle' });
    setCooldownUntil(Date.now() + COOLDOWN_MS);
    startTransition(async () => {
      const res = await enrichRecordOnDemand({ recordId });
      if (res.ok) {
        setFeedback({
          kind: 'success',
          totalTracks: res.data?.totalTracks ?? 0,
          tracksAlreadyProcessed: res.data?.tracksAlreadyProcessed ?? 0,
          tracksUpdated: res.data?.tracksUpdated ?? 0,
          tracksSkipped: res.data?.tracksSkipped ?? 0,
        });
      } else {
        setFeedback({ kind: 'error', message: res.error });
      }
    });
  }

  const baseLabel = alreadyAttempted
    ? 'Tentar buscar sugestões de novo'
    : 'Buscar sugestões de audio features';

  const label = isPending
    ? 'Buscando… (pode levar até 15s)'
    : cooldownRemaining > 0
      ? `Aguarde ${cooldownRemaining}s`
      : baseLabel;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {label}
      </button>
      {feedback.kind === 'success' ? (
        <p className="font-serif italic text-[13px] text-ok">
          {renderFeedback(feedback)}
        </p>
      ) : null}
      {feedback.kind === 'error' ? (
        <p className="font-serif italic text-[13px] text-warn">{feedback.message}</p>
      ) : null}
    </div>
  );
}

function renderFeedback(f: Extract<FeedbackState, { kind: 'success' }>): string {
  const { totalTracks, tracksAlreadyProcessed, tracksUpdated, tracksSkipped } = f;
  // Caso 1: enriqueceu algo novo
  if (tracksUpdated > 0) {
    const base = `${tracksUpdated} faixa${tracksUpdated === 1 ? '' : 's'} enriquecida${tracksUpdated === 1 ? '' : 's'}`;
    const extras: string[] = [];
    if (tracksSkipped > 0) extras.push(`${tracksSkipped} sem match`);
    if (tracksAlreadyProcessed > 0) extras.push(`${tracksAlreadyProcessed} já processada${tracksAlreadyProcessed === 1 ? '' : 's'}`);
    return extras.length > 0 ? `${base}. (${extras.join(' · ')})` : `${base}.`;
  }
  // Caso 2: nada elegível porque tudo já foi processado antes
  if (tracksAlreadyProcessed > 0 && tracksAlreadyProcessed === totalTracks) {
    return 'Todas as faixas já foram processadas antes. Role a página pra ver as sugestões existentes.';
  }
  // Caso 3: tentou tudo e não achou match
  if (tracksSkipped > 0 && tracksUpdated === 0) {
    return 'Nenhuma faixa tinha match nos catálogos externos (MusicBrainz/AcousticBrainz).';
  }
  // Caso 4: disco sem faixas ou edge case
  if (totalTracks === 0) {
    return 'Disco sem faixas elegíveis.';
  }
  return 'Nada pra fazer — o disco já está atualizado.';
}
