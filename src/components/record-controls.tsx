'use client';

import { useState, useTransition } from 'react';
import { updateRecordAuthorFields, updateRecordStatus } from '@/lib/actions';
import { ShelfPicker } from './shelf-picker';

type Status = 'unrated' | 'active' | 'discarded';

export function RecordControls({
  recordId,
  status,
  shelfLocation,
  notes,
  userShelves,
}: {
  recordId: number;
  status: Status;
  shelfLocation: string | null;
  notes: string | null;
  userShelves: string[];
}) {
  const [localStatus, setLocalStatus] = useState<Status>(status);
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

      {/* Shelf location — Inc 21: picker com auto-add */}
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute mb-1 block">
          Prateleira
        </label>
        <ShelfPicker
          recordId={recordId}
          current={shelfLocation}
          userShelves={userShelves}
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
