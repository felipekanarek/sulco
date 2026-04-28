'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSet } from '@/lib/actions';

type SetData = {
  id: number;
  name: string;
  eventDate: Date | null;
  location: string | null;
  briefing: string | null;
};

/**
 * Modal de edição dos campos do set (Inc 016/Inc 15).
 *
 * Pattern espelha <DeleteAccountModal>: state local `open`, modal
 * fullscreen com role="dialog" quando aberto, ESC + clique no
 * overlay fecham. Reusa Server Action `updateSet` existente
 * (partial update + ownership + normalizeDate + revalidatePath
 * nas 3 rotas).
 *
 * Reset do form ao reabrir (useEffect): descarta edits cancelados.
 */
export function EditSetModal({ set }: { set: SetData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(set.name);
  const [eventDate, setEventDate] = useState(formatForInput(set.eventDate));
  const [location, setLocation] = useState(set.location ?? '');
  const [briefing, setBriefing] = useState(set.briefing ?? '');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on reopen (decisão 7 do research): descarta edits anteriores
  // não-salvos quando DJ reabre o modal.
  useEffect(() => {
    if (open) {
      setName(set.name);
      setEventDate(formatForInput(set.eventDate));
      setLocation(set.location ?? '');
      setBriefing(set.briefing ?? '');
      setError(null);
    }
  }, [open, set]);

  const isValid =
    name.trim().length > 0 && name.length <= 200 && briefing.length <= 5000;

  async function submit() {
    if (!isValid) return;
    setIsPending(true);
    setError(null);
    try {
      const res = await updateSet({
        setId: set.id,
        name: name.trim(),
        // datetime-local entrega "" quando vazio — mandamos null pra
        // limpar o campo. Browser parseia "YYYY-MM-DDTHH:mm" como hora
        // local; normalizeDate (server) descarta Invalid Date pra null.
        eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        location: location.trim() || null,
        briefing: briefing.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
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
        className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 min-h-[44px] transition-colors"
      >
        ✏️ Editar set
      </button>
    );
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4 md:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-set-title"
        className="bg-paper border border-line max-w-[640px] w-full p-6 md:p-8 rounded-sm max-h-[90vh] overflow-y-auto"
      >
        <p className="eyebrow mb-2">Editar set</p>
        <h2
          id="edit-set-title"
          className="font-serif italic text-[24px] md:text-[28px] mb-5"
        >
          {set.name}
        </h2>

        <label className="flex flex-col gap-1 mb-4">
          <span className="label-tech">Nome</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            className="font-serif text-[16px] bg-transparent border-b border-ink pb-2 outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 mb-4">
          <span className="label-tech">Data do evento (opcional)</span>
          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="font-mono text-[14px] bg-transparent border-b border-ink pb-2 outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 mb-4">
          <span className="label-tech">Local (opcional)</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            className="font-serif text-[16px] bg-transparent border-b border-ink pb-2 outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 mb-5">
          <span className="label-tech">Briefing (opcional)</span>
          <textarea
            rows={5}
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            maxLength={5000}
            className="font-serif text-[15px] bg-transparent border border-line p-2 outline-none focus:border-accent resize-y"
          />
          <span className="font-mono text-[11px] text-ink-mute self-end">
            {briefing.length} / 5000
          </span>
        </label>

        {error ? (
          <p
            role="alert"
            className="font-serif italic text-[14px] text-warn bg-warn/10 border border-warn/40 px-4 py-3 mb-4"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-4 py-2 min-h-[44px] disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid || isPending}
            className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink bg-ink text-paper hover:bg-paper hover:text-ink px-4 py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Converte Date (UTC at-rest) pra string `YYYY-MM-DDTHH:mm` em hora
 * local — formato aceito por <input type="datetime-local">.
 *
 * Browser interpreta o resultado como hora local do user. Convenção
 * do projeto: America/Sao_Paulo na UI, UTC at-rest (CLAUDE.md
 * histórico de decisões).
 */
function formatForInput(d: Date | null): string {
  if (!d) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
