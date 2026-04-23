'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getImportProgress, type ImportProgress } from '@/lib/actions';

/**
 * Exibe o progresso do import inicial (FR-030). Faz polling a cada 3s
 * enquanto o `syncRun` kind='initial_import' estiver `running`.
 *
 * Quando `running` vira false e o outcome é 'ok', chama router.refresh()
 * para a página pai (provavelmente `/`) atualizar listando os records.
 *
 * Fonte de dados: Server Action `getImportProgress()` — user-scoped.
 */
export function ImportProgressCard({ initial }: { initial: ImportProgress }) {
  const router = useRouter();
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (!state.running) return; // nada a fazer se não está rodando
    const id = setInterval(async () => {
      const next = await getImportProgress();
      setState(next);
      // refresh da árvore RSC quando o progresso avança; também pega o término.
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [state.running, router]);

  // Estados terminais — mostra mensagem contextual
  if (state.outcome === 'ok') {
    return (
      <Card tone="ok">
        <p className="eyebrow text-ok">Import concluído</p>
        <p className="font-serif text-2xl italic mt-1">{state.x} discos importados</p>
      </Card>
    );
  }

  if (state.outcome === 'erro') {
    return (
      <Card tone="warn">
        <p className="eyebrow text-warn">Import interrompido</p>
        <p className="mt-2 text-sm">{state.errorMessage ?? 'Erro inesperado.'}</p>
      </Card>
    );
  }

  if (state.outcome === 'rate_limited') {
    return (
      <Card tone="warn">
        <p className="eyebrow text-warn">Pausado pelo rate limit do Discogs</p>
        <p className="mt-2 text-sm">
          {state.x} discos importados até agora. Retomando automaticamente no próximo ciclo.
        </p>
      </Card>
    );
  }

  if (state.outcome === 'idle' || (!state.running && state.outcome !== 'parcial')) {
    return null; // nenhum import ativo — não exibe card
  }

  // running / parcial
  const pct = state.y > 0 ? Math.min(100, Math.round((state.x / state.y) * 100)) : 0;
  return (
    <Card tone="info" aria-live="polite">
      <p className="eyebrow">Importando do Discogs</p>
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
          <div className="absolute left-0 top-0 bottom-0 bg-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="mt-3 text-xs text-ink-mute">
        Respeitando rate limit de 60 req/min. Você pode navegar enquanto o import roda.
      </p>
    </Card>
  );
}

function Card({
  children,
  tone,
  ...rest
}: {
  children: React.ReactNode;
  tone: 'info' | 'ok' | 'warn';
  'aria-live'?: 'polite' | 'off';
}) {
  const border =
    tone === 'ok' ? 'border-ok/40' : tone === 'warn' ? 'border-warn/40' : 'border-line';
  return (
    <section {...rest} className={`border ${border} bg-paper-raised px-6 py-5 mb-8`}>
      {children}
    </section>
  );
}
