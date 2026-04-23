'use client';

/**
 * Toggle binário para `tracks.isBomb` (FR-018).
 * Visualmente destacado quando ligado. Aria: `role="switch"` + `aria-checked`.
 */
export function BombaToggle({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const size = compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-[11px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={value ? 'Bomba ligada (clique para desligar)' : 'Bomba desligada (clique para ligar)'}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`font-mono uppercase tracking-[0.12em] border rounded-sm transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${size} ${
        value
          ? 'bg-accent text-paper border-accent hover:bg-accent-soft'
          : 'bg-paper text-ink-mute border-line hover:border-ink hover:text-ink'
      }`}
    >
      <span aria-hidden className="text-base leading-none">💣</span>
      <span>{value ? 'Bomba' : 'bomba'}</span>
    </button>
  );
}
