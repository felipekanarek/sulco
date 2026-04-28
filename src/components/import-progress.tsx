'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  acknowledgeImportProgress,
  getImportProgress,
  type ImportProgress,
} from '@/lib/actions';

/**
 * Exibe o progresso do import inicial (FR-030). Faz polling a cada 3s
 * enquanto o `syncRun` kind='initial_import' estiver `running`.
 *
 * Layout unificado: o card de progresso tem o mesmo template em
 * running / parcial / rate_limited — só o eyebrow e o hint de rodapé
 * mudam. `ok` e `erro` têm cards próprios menores.
 *
 * 010 (Bug 13): em estado terminal, exibe botão "× fechar" que persiste
 * `users.importAcknowledgedAt`. Banner some quando lastAck >= runStartedAt.
 * Em estado running, banner não tem botão fechar.
 */
export function ImportProgressCard({ initial }: { initial: ImportProgress }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(async () => {
      const next = await getImportProgress();
      setState(next);
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [state.running, router]);

  // outcome 'idle' E sem progresso → nada a mostrar (zero-state)
  if (state.outcome === 'idle' && state.x === 0) return null;

  // 010 (Bug 13): em estado terminal já reconhecido, não renderiza.
  const isTerminal = !state.running;
  const isAcked =
    state.lastAck !== null &&
    state.runStartedAt !== null &&
    state.lastAck.getTime() >= state.runStartedAt.getTime();
  if (isTerminal && isAcked) return null;

  function handleAck() {
    startTransition(async () => {
      const res = await acknowledgeImportProgress();
      if (res.ok) {
        // Atualização otimista: useState(initial) não re-sincroniza com a
        // prop após router.refresh(), então setamos lastAck localmente
        // para o gate `isAcked` virar true e o componente retornar null.
        setState((prev) => ({ ...prev, lastAck: new Date() }));
        router.refresh();
      }
    });
  }

  const showCloseButton = isTerminal;

  if (state.outcome === 'ok') {
    return (
      <Card tone="ok" onClose={showCloseButton ? handleAck : undefined} pending={pending}>
        <p className="eyebrow text-ok">Import concluído</p>
        <p className="font-serif text-2xl italic mt-1">{state.x} discos importados</p>
      </Card>
    );
  }

  if (state.outcome === 'erro') {
    return (
      <Card tone="warn" onClose={showCloseButton ? handleAck : undefined} pending={pending}>
        <p className="eyebrow text-warn">Import interrompido</p>
        <p className="mt-2 text-sm">{state.errorMessage ?? 'Erro inesperado.'}</p>
      </Card>
    );
  }

  // running / parcial / rate_limited / idle-com-records-já-importados:
  // todos usam o mesmo layout com X de Y + barra, só muda o eyebrow
  // e o hint do rodapé.
  const isRateLimited = state.outcome === 'rate_limited';
  const isRunning = state.running;

  const eyebrow = isRunning
    ? 'Importando do Discogs'
    : isRateLimited
      ? 'Pausado pelo rate limit do Discogs'
      : 'Import pausado';

  const hint = isRunning
    ? 'Respeitando rate limit de 60 req/min. Você pode navegar enquanto o import roda.'
    : isRateLimited
      ? 'O Discogs pediu pausa temporária. Recarregue esta página em alguns minutos para retomar de onde parou.'
      : 'Recarregue a página para retomar o import de onde parou.';

  const pct = state.y > 0 ? Math.min(100, Math.round((state.x / state.y) * 100)) : 0;

  return (
    <Card
      tone="info"
      onClose={showCloseButton ? handleAck : undefined}
      pending={pending}
      aria-live="polite"
    >
      <p className="eyebrow">{eyebrow}</p>
      <p className="font-serif text-2xl italic mt-1">
        {state.x} <span className="text-ink-mute">de</span> {state.y || '?'} discos
      </p>
      {state.y > 0 ? (
        <div
          className="mt-3 h-1 bg-line relative overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do import"
        >
          <div
            className="absolute left-0 top-0 bottom-0 bg-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className="mt-3 text-xs text-ink-mute">{hint}</p>
    </Card>
  );
}

function Card({
  children,
  tone,
  onClose,
  pending,
  ...rest
}: {
  children: React.ReactNode;
  tone: 'info' | 'ok' | 'warn';
  onClose?: () => void;
  pending?: boolean;
  'aria-live'?: 'polite' | 'off';
}) {
  const border =
    tone === 'ok' ? 'border-ok/40' : tone === 'warn' ? 'border-warn/40' : 'border-line';
  const closePadding = onClose ? 'pr-14' : '';
  return (
    <section
      {...rest}
      className={`relative border ${border} bg-paper-raised px-6 py-5 mb-8 ${closePadding}`}
    >
      {children}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="Fechar banner de import"
          className="absolute top-2 right-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-mute hover:text-ink disabled:opacity-50 disabled:cursor-wait text-xl leading-none"
        >
          ×
        </button>
      ) : null}
    </section>
  );
}
