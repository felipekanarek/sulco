'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDiscogsCredential } from '@/lib/actions';

/**
 * Form para atualizar `discogsUsername` e PAT (FR-004, FR-046).
 * Botão "Substituir" revela os campos; valida via saveDiscogsCredential
 * que já bate na API Discogs (FR-051 tratamento de erros).
 */
export function UpdateCredentialForm({
  currentUsername,
}: {
  currentUsername: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'ok' | 'warn' | null>(null);

  async function submit(formData: FormData) {
    setIsPending(true);
    setMessage(null);
    setMessageKind(null);
    try {
      const res = await saveDiscogsCredential({
        discogsUsername: String(formData.get('discogsUsername') ?? '').trim(),
        discogsPat: String(formData.get('discogsPat') ?? '').trim(),
      });
      if (!res.ok) {
        setMessage(res.error);
        setMessageKind('warn');
        return;
      }
      setMessage('Credencial atualizada. Sync volta a rodar normalmente.');
      setMessageKind('ok');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado.');
      setMessageKind('warn');
    } finally {
      setIsPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-4">
        <div>
          <p className="label-tech text-ink-mute mb-1">Username Discogs</p>
          <p className="font-mono text-[15px]">{currentUsername}</p>
          <p className="label-tech text-ink-mute mt-2">
            Personal Access Token — cifrado at-rest (não exibido)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto font-mono text-[11px] uppercase tracking-[0.12em] border border-ink text-ink hover:bg-ink hover:text-paper px-4 py-2 rounded-sm transition-colors"
        >
          Substituir
        </button>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4" aria-busy={isPending ? 'true' : 'false'}>
      <div>
        <label className="label-tech block mb-1" htmlFor="discogsUsername">
          Username Discogs
        </label>
        <input
          id="discogsUsername"
          name="discogsUsername"
          type="text"
          required
          defaultValue={currentUsername}
          className="w-full font-mono text-sm bg-paper border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-accent"
          disabled={isPending}
        />
      </div>
      <div>
        <label className="label-tech block mb-1" htmlFor="discogsPat">
          Personal Access Token (novo)
        </label>
        <input
          id="discogsPat"
          name="discogsPat"
          type="password"
          required
          autoComplete="off"
          placeholder="••••••••••••"
          className="w-full font-mono text-sm bg-paper border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-accent"
          disabled={isPending}
        />
      </div>
      {message ? (
        <p
          role={messageKind === 'warn' ? 'alert' : 'status'}
          className={`label-tech ${messageKind === 'warn' ? 'text-warn' : 'text-ok'}`}
        >
          {message}
        </p>
      ) : null}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setMessage(null);
          }}
          disabled={isPending}
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line text-ink-soft hover:border-ink hover:text-ink px-4 py-2 rounded-sm transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper hover:bg-accent px-4 py-2 rounded-sm transition-colors disabled:opacity-50"
        >
          {isPending ? 'Validando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
