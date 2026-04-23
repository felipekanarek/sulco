'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveDiscogsCredential } from '@/lib/actions';

export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const discogsUsername = String(formData.get('discogsUsername') ?? '').trim();
    const discogsPat = String(formData.get('discogsPat') ?? '').trim();
    startTransition(async () => {
      const result = await saveDiscogsCredential({ discogsUsername, discogsPat });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // FR-050 passo (6): volta para `/` após sucesso; o import fica rodando em background.
      router.push('/');
      router.refresh();
    });
  }

  return (
    <form
      action={onSubmit}
      className="space-y-6"
      aria-busy={isPending ? 'true' : 'false'}
      aria-describedby={error ? 'onboarding-error' : undefined}
    >
      <div>
        <label htmlFor="discogsUsername" className="label-tech block mb-2">
          Username do Discogs
        </label>
        <input
          id="discogsUsername"
          name="discogsUsername"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="felipekanarek"
          className="w-full border border-line bg-paper-raised px-4 py-3 font-mono text-sm focus:outline-none focus:border-accent"
          disabled={isPending}
        />
        <p className="text-xs text-ink-mute mt-2">O username que aparece no seu perfil do Discogs (sem @).</p>
      </div>

      <div>
        <label htmlFor="discogsPat" className="label-tech block mb-2">
          Personal Access Token
        </label>
        <input
          id="discogsPat"
          name="discogsPat"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="••••••••••••••••"
          className="w-full border border-line bg-paper-raised px-4 py-3 font-mono text-sm focus:outline-none focus:border-accent"
          disabled={isPending}
        />
        <p className="text-xs text-ink-mute mt-2">Cifrado com AES-256-GCM antes de persistir.</p>
      </div>

      {error ? (
        <div
          id="onboarding-error"
          role="alert"
          className="border border-accent/40 bg-accent/5 text-ink px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="px-6 py-3 bg-ink text-paper font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Validando com o Discogs...' : 'Conectar e importar coleção'}
      </button>
    </form>
  );
}
