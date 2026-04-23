'use client';

import { useState, useTransition } from 'react';
import { updateRecordAuthorFields, updateRecordStatus } from '@/lib/actions';

type Status = 'unrated' | 'active' | 'discarded';

export function RecordControls({
  recordId,
  status,
  shelfLocation,
  notes,
}: {
  recordId: number;
  status: Status;
  shelfLocation: string | null;
  notes: string | null;
}) {
  const [localStatus, setLocalStatus] = useState<Status>(status);
  const [localShelf, setLocalShelf] = useState(shelfLocation ?? '');
  const [localNotes, setLocalNotes] = useState(notes ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(s: Status) {
    if (s === localStatus) return;
    setLocalStatus(s);
    startTransition(async () => {
      const res = await updateRecordStatus({ recordId, status: s });
      if (!res.ok) {
        setLocalStatus(status);
        setError(res.error);
      }
    });
  }

  function commitShelf() {
    const v = localShelf.trim();
    if (v === (shelfLocation ?? '')) return;
    startTransition(async () => {
      const res = await updateRecordAuthorFields({
        recordId,
        shelfLocation: v || null,
      });
      if (!res.ok) setError(res.error);
    });
  }

  function commitNotes() {
    const v = localNotes.trim();
    if (v === (notes ?? '')) return;
    startTransition(async () => {
      const res = await updateRecordAuthorFields({
        recordId,
        notes: v || null,
      });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex flex-col gap-2">
        {(['active', 'unrated', 'discarded'] as const).map((s) => {
          const active = localStatus === s;
          return (
            <button
              key={s}
              type="button"
              disabled={isPending}
              onClick={() => setStatus(s)}
              className={`font-mono text-[11px] uppercase tracking-[0.12em] px-4 py-3 rounded-sm border transition-colors text-left disabled:opacity-60 ${
                active
                  ? 'bg-ink text-paper border-ink'
                  : 'border-line text-ink hover:border-ink'
              }`}
            >
              {s === 'active' && 'Ativo para discotecar'}
              {s === 'unrated' && 'Não avaliado'}
              {s === 'discarded' && 'Descartar'}
            </button>
          );
        })}
      </div>

      {/* Shelf location */}
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute mb-1 block">
          Prateleira
        </label>
        <input
          type="text"
          value={localShelf}
          onChange={(e) => setLocalShelf(e.target.value)}
          onBlur={commitShelf}
          placeholder="ex: E3-P2"
          maxLength={50}
          className="w-full font-mono text-sm bg-transparent border-0 border-b border-line pb-1 outline-none focus:border-accent"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute mb-1 block">
          Notas
        </label>
        <textarea
          rows={3}
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={commitNotes}
          maxLength={5000}
          className="w-full font-serif text-[15px] bg-transparent border border-line p-2 outline-none focus:border-accent resize-y"
        />
      </div>

      {error ? <p className="text-xs text-warn">{error}</p> : null}
    </div>
  );
}
