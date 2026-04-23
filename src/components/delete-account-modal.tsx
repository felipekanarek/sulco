'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount } from '@/lib/actions';

/**
 * Modal de confirmação de deleção de conta (FR-043).
 * Exige digitar literal "APAGAR" antes de habilitar o botão.
 */
export function DeleteAccountModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (text !== 'APAGAR') return;
    setIsPending(true);
    setError(null);
    try {
      const res = await deleteAccount({ confirm: 'APAGAR' });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Clerk revogou a sessão — redireciona para home (middleware manda pra sign-in)
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] uppercase tracking-[0.12em] border border-warn text-warn hover:bg-warn hover:text-paper px-4 py-2 rounded-sm transition-colors"
      >
        Apagar conta
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="bg-paper border border-warn max-w-[520px] w-full p-8 rounded-sm"
      >
        <p className="eyebrow text-warn mb-2">Ação irreversível</p>
        <h2 id="delete-account-title" className="title-display text-[28px] mb-4">
          Apagar conta
        </h2>
        <p className="font-serif text-[16px] text-ink-soft leading-relaxed mb-5">
          Todos os seus dados serão <strong>permanentemente deletados</strong>:
          coleção importada, curadoria (status, faixas selecionadas, BPM, Bomba,
          sets), e histórico de sincronização. Sua conta Clerk também será
          revogada.
        </p>
        <p className="font-serif text-[16px] text-ink leading-relaxed mb-3">
          Para confirmar, digite <strong>APAGAR</strong> em maiúsculas:
        </p>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          className="w-full font-mono text-lg bg-transparent border-b border-ink pb-2 outline-none focus:border-warn mb-5"
          aria-label="Confirmação"
          placeholder="APAGAR"
        />
        {error ? (
          <p role="alert" className="text-xs text-warn mb-4">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setText('');
              setError(null);
            }}
            disabled={isPending}
            className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line text-ink hover:border-ink px-4 py-2 rounded-sm disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || text !== 'APAGAR'}
            className="font-mono text-[11px] uppercase tracking-[0.12em] bg-warn text-paper hover:bg-warn/80 px-4 py-2 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Apagando...' : 'Apagar permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}
