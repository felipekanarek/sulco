'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteSet } from '@/lib/actions';

/**
 * Botão de exclusão de set (Inc 30 / 031).
 *
 * Hard-delete via Server Action `deleteSet`. Cascade FK em `set_tracks`
 * remove apenas a relação set↔track — tracks/records permanecem
 * intactos com toda curadoria autoral.
 *
 * UX: `window.confirm` nativo (fullscreen mobile iOS/Android — Princípio V)
 * com texto explícito sobre irreversibilidade. Disabled durante a
 * Server Action. Em caso de erro, mensagem inline com auto-dismiss 5s
 * (mesmo pattern Inc 19).
 *
 * Posicionamento: header de `/sets/[id]` ao lado de "Editar set" e
 * `/sets/[id]/montar` ao lado de `<EditSetModal>` Inc 16.
 */
export function DeleteSetButton({
  setId,
  setName,
  className,
}: {
  setId: number;
  setName: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss da mensagem de erro após 5s (mesmo pattern Inc 19).
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  function handleClick() {
    if (isPending) return;
    const confirmed = window.confirm(
      `Excluir o set "${setName}"?\n\nAs faixas dele permanecem na coleção.\nEsta operação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSet({ setId });
      if (res.ok) {
        router.push('/sets');
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line text-ink-soft px-5 py-3 min-h-[44px] inline-flex items-center justify-center rounded-sm hover:border-accent hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={`Excluir set ${setName}`}
      >
        {isPending ? 'Excluindo…' : 'Excluir set'}
      </button>
      {error ? (
        <p className="font-mono text-[11px] text-accent" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
