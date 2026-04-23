/**
 * Badge Bomba reutilizável — garante layout estável (altura fixa, emoji com
 * fonte de sistema, sem estourar line-height do container pai).
 *
 * Usos comuns:
 * - `size="md"` com label — próximo a títulos de disco (lista)
 * - `size="sm"` com label — card de grade
 * - `size="icon"` sem label — inline ao lado de faixas (tracklist, candidatos, sets)
 */
export function BombaBadge({
  size = 'md',
  withLabel = true,
}: {
  size?: 'md' | 'sm' | 'icon';
  withLabel?: boolean;
}) {
  const base =
    'inline-flex items-center gap-1 border border-accent text-accent bg-accent/5 rounded-sm align-middle leading-none font-mono not-italic uppercase tracking-[0.12em] whitespace-nowrap';
  const sizeCls =
    size === 'md'
      ? 'h-[22px] px-2 text-[10px]'
      : size === 'sm'
        ? 'h-[18px] px-1.5 text-[9px]'
        : 'h-[18px] w-[22px] justify-center px-0 text-[11px]';
  return (
    <span
      className={`${base} ${sizeCls}`}
      aria-label="Disco com faixa Bomba"
      title="Contém faixa Bomba"
    >
      <span
        aria-hidden
        className="leading-none not-italic"
        style={{
          fontStyle: 'normal',
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        }}
      >
        💣
      </span>
      {withLabel && size !== 'icon' ? <span>Bomba</span> : null}
    </span>
  );
}

/**
 * Versão só-emoji, inline em tracklists (sem borda, compacto).
 * Box fixo 18x18 com font-size 14px e line-height idêntico, garantindo
 * que o emoji NUNCA ultrapasse a caixa do container (independente de
 * leading-tight no pai) e fique centralizado vertical + horizontal.
 */
export function BombaInline() {
  return (
    <span
      aria-label="Bomba"
      title="Faixa Bomba"
      className="inline-flex items-center justify-center align-middle not-italic"
      style={{
        width: '18px',
        height: '18px',
        fontSize: '14px',
        lineHeight: '18px',
        fontStyle: 'normal',
        verticalAlign: '-3px',
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      }}
    >
      💣
    </span>
  );
}
