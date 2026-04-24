/**
 * Chip — tag visual pequena e uniforme (003-faixas-ricas-montar).
 *
 * Três variants distinguem tipos de metadado na UI:
 *  - `mood`    → sensação/atmosfera ("solar", "festivo", "melancólico");
 *                fundo preenchido accent-soft, peso visual maior.
 *  - `context` → função no set ("pico", "aquecimento", "fechamento");
 *                estilo "etiqueta" sóbria (fundo transparente, borda).
 *  - `ghost`   → indicador/placeholder ("+N mais", "sem curadoria");
 *                borda tracejada, sem peso visual.
 *
 * Server Component puro — sem estado, sem `use client`.
 */

type ChipVariant = 'mood' | 'context' | 'ghost';

export function Chip({
  variant,
  children,
  title,
}: {
  variant: ChipVariant;
  children: React.ReactNode;
  title?: string;
}) {
  const cls = {
    mood: 'bg-accent-soft text-ink border-accent/40',
    context: 'bg-transparent text-ink-soft border-line',
    ghost: 'bg-transparent text-ink-mute border-dashed border-line',
  }[variant];
  return (
    <span
      title={title}
      className={`inline-block font-mono text-[10px] uppercase tracking-[0.06em] leading-[1.6] px-2 py-[1px] border rounded-sm whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}
