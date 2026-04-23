'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { triggerManualSync } from '@/lib/actions';

/**
 * Botão "Sincronizar agora" (FR-033).
 * - `disabled`: credencial inválida etc. → não permite clicar
 * - `initialRunning`: há um syncRun `running` no servidor (import/manual/daily) →
 *   reflete a UI como "Sync em andamento..." e faz auto-polling a cada 3s via
 *   `router.refresh()` até o run terminar e o prop virar false no próximo render
 */
export function ManualSyncButton({
  disabled,
  reason,
  initialRunning = false,
}: {
  disabled?: boolean;
  reason?: string;
  initialRunning?: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'ok' | 'warn' | null>(null);

  // Enquanto o server diz que há run ativo, faz polling a cada 3s
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!initialRunning) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    pollingRef.current = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [initialRunning, router]);

  const busy = isPending || initialRunning;
  const effectivelyDisabled = disabled || busy;

  async function run() {
    if (effectivelyDisabled) return;
    setIsPending(true);
    setMessage(null);
    setMessageKind(null);
    try {
      const res = await triggerManualSync();
      if (!res.ok) {
        setMessage(res.error);
        setMessageKind('warn');
        return;
      }
      const d = res.data;
      setMessage(
        d
          ? `Sync ok — ${d.newCount ?? 0} novos, ${d.removedCount ?? 0} arquivados.`
          : 'Sync ok.',
      );
      setMessageKind('ok');
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado.');
      setMessageKind('warn');
    } finally {
      setIsPending(false);
    }
  }

  const label = isPending
    ? 'Sincronizando...'
    : initialRunning
      ? 'Sync em andamento...'
      : 'Sincronizar agora';

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={effectivelyDisabled}
        title={reason}
        className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 rounded-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {label}
      </button>
      {message ? (
        <p
          className={`label-tech ${messageKind === 'warn' ? 'text-warn' : 'text-ok'}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {initialRunning ? (
        <p className="label-tech text-ink-mute text-right">
          Atualizando automaticamente...
        </p>
      ) : null}
      {disabled && reason && !message ? (
        <p className="label-tech text-ink-mute text-right max-w-[220px]">{reason}</p>
      ) : null}
    </div>
  );
}
