'use client';

import { useState } from 'react';

/**
 * Picker Camelot (FR-017b). Valores `1A..12A` (menores) e `1B..12B` (maiores).
 * Layout wheel: dois anéis de 12 com toggle entre A e B.
 */
export function CamelotWheel({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  disabled?: boolean;
}) {
  const [manual, setManual] = useState<string>(value ?? '');
  const [error, setError] = useState<string | null>(null);

  function selectKey(k: string) {
    setError(null);
    setManual(k);
    onChange(k);
  }
  function clear() {
    setError(null);
    setManual('');
    onChange(null);
  }
  function commitManual(raw: string) {
    const trimmed = raw.trim().toUpperCase();
    if (trimmed === '') {
      clear();
      return;
    }
    if (!/^(?:[1-9]|1[0-2])[AB]$/.test(trimmed)) {
      setError('Use notação Camelot (ex: 8A, 11B).');
      return;
    }
    setError(null);
    setManual(trimmed);
    onChange(trimmed);
  }

  const numbers = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
        <div>
          <p className="label-tech mb-1">Menores (A)</p>
          <div className="grid grid-cols-6 gap-1 mb-2">
            {numbers.map((n) => {
              const k = `${n}A`;
              const active = value === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => selectKey(k)}
                  className={`font-mono text-[10px] px-1.5 py-1 border rounded-sm transition-colors ${
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-paper border-line text-ink-soft hover:border-ink hover:text-ink'
                  } disabled:opacity-50`}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <p className="label-tech mb-1">Maiores (B)</p>
          <div className="grid grid-cols-6 gap-1">
            {numbers.map((n) => {
              const k = `${n}B`;
              const active = value === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => selectKey(k)}
                  className={`font-mono text-[10px] px-1.5 py-1 border rounded-sm transition-colors ${
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-paper border-line text-ink-soft hover:border-ink hover:text-ink'
                  } disabled:opacity-50`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onBlur={(e) => commitManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitManual((e.target as HTMLInputElement).value);
            }
          }}
          placeholder="ex: 8A"
          className="w-[70px] font-mono text-sm bg-transparent border-0 border-b border-line pb-1 focus:outline-none focus:border-accent"
          disabled={disabled}
          aria-label="Digitar tom Camelot diretamente"
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="label-tech text-ink-mute hover:text-accent underline"
          >
            limpar
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-warn">{error}</p> : null}
    </div>
  );
}
