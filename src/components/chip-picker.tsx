'use client';

import { useMemo, useState } from 'react';

/**
 * Chip picker com autocomplete + criação inline (FR-017a).
 * Dedup case-insensitive. Normalização (trim + lowercase) feita no caller.
 */
export function ChipPicker({
  value,
  onChange,
  suggestions,
  placeholder = 'digite e Enter',
  disabled,
  variant = 'mood',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  variant?: 'mood' | 'ctx';
}) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const valueSet = useMemo(
    () => new Set(value.map((v) => v.toLowerCase())),
    [value],
  );

  const filteredSuggestions = useMemo(() => {
    const d = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !valueSet.has(s.toLowerCase()))
      .filter((s) => (d ? s.toLowerCase().includes(d) : true))
      .slice(0, 10);
  }, [draft, suggestions, valueSet]);

  function add(term: string) {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return;
    if (valueSet.has(normalized)) return;
    onChange([...value, normalized]);
    setDraft('');
  }
  function remove(term: string) {
    onChange(value.filter((v) => v.toLowerCase() !== term.toLowerCase()));
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const chipCls = variant === 'mood' ? 'text-accent border-accent-soft' : 'text-ok border-ok';

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap items-center min-h-[28px]">
        {value.map((v) => (
          <span
            key={v}
            className={`font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border rounded-sm bg-paper inline-flex items-center gap-2 ${chipCls}`}
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              disabled={disabled}
              aria-label={`Remover ${v}`}
              className="text-ink-mute hover:text-accent leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-[120px] font-mono text-sm bg-transparent border-0 border-b border-line pb-1 outline-none focus:border-accent"
        />
      </div>
      {focused && filteredSuggestions.length > 0 ? (
        <div className="flex gap-1 flex-wrap">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // evita blur antes do click
                add(s);
              }}
              className="font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 border border-line text-ink-mute hover:border-ink hover:text-ink rounded-sm"
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
