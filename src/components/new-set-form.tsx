'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSet } from '@/lib/actions';

export function NewSetForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    const name = String(formData.get('name') ?? '').trim();
    const location = String(formData.get('location') ?? '').trim();
    const briefing = String(formData.get('briefing') ?? '').trim();
    const eventDateRaw = String(formData.get('eventDate') ?? '').trim();

    // datetime-local envia "YYYY-MM-DDTHH:mm" no fuso do navegador.
    // O navegador do DJ está em America/Sao_Paulo (FR-028/Q4 sessão 4);
    // convertemos para ISO UTC aqui pra persistir já em UTC.
    let eventDateIso: string | null = null;
    if (eventDateRaw.length > 0) {
      const d = new Date(eventDateRaw);
      if (!Number.isNaN(d.getTime())) eventDateIso = d.toISOString();
    }

    startTransition(async () => {
      const res = await createSet({
        name,
        eventDate: eventDateIso,
        location: location || null,
        briefing: briefing || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Redireciona para a tela de montagem do set recém-criado.
      router.push(`/sets/${res.data!.setId}/montar`);
      router.refresh();
    });
  }

  return (
    <form
      action={onSubmit}
      aria-busy={isPending ? 'true' : 'false'}
      aria-describedby={error ? 'new-set-error' : undefined}
      className="flex flex-col gap-8"
    >
      <FormField label="Nome do set">
        <input
          type="text"
          name="name"
          required
          minLength={1}
          maxLength={200}
          placeholder="Ex.: Aniversário da Ana"
          className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[22px] italic placeholder:text-ink-mute outline-none focus:border-accent"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-6">
        <FormField label="Data do evento">
          <input
            type="datetime-local"
            name="eventDate"
            className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[19px] outline-none focus:border-accent"
          />
        </FormField>
        <FormField label="Local">
          <input
            type="text"
            name="location"
            maxLength={200}
            placeholder="Cidade ou venue"
            className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[19px] italic placeholder:text-ink-mute outline-none focus:border-accent"
          />
        </FormField>
      </div>

      <FormField label="Briefing do evento">
        <textarea
          name="briefing"
          rows={6}
          maxLength={5000}
          placeholder="Descreva o clima, público, horários, gêneros…"
          className="w-full bg-transparent border border-dashed border-line p-4 font-serif text-[19px] italic placeholder:text-ink-mute outline-none focus:border-ink focus:border-solid rounded-sm resize-y"
        />
      </FormField>

      {error ? (
        <div
          id="new-set-error"
          role="alert"
          className="border border-accent/40 bg-accent/5 text-ink px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-4 pt-6 border-t border-line">
        <button
          type="submit"
          disabled={isPending}
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-8 py-4 rounded-sm hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? 'Criando...' : 'Criar e montar →'}
        </button>
      </div>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}
