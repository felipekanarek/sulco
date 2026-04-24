/**
 * Badge visual de "sugestão externa" pros campos de audio features
 * (bpm/tom/energia/moods) de uma faixa. Server Component puro — sem
 * estado, sem JS.
 *
 * Rendered apenas quando `source === 'acousticbrainz'`. Pra 'manual'
 * ou null, retorna `null` (sem marca visual).
 *
 * Ver spec 005 FR-011 e contracts/server-actions.md §"Contrato visual".
 */

type Source = 'acousticbrainz' | 'manual' | null | undefined;

export function AudioFeaturesBadge({ source }: { source: Source }) {
  if (source !== 'acousticbrainz') return null;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute border border-line px-2 py-0.5 rounded-sm inline-block"
      title="Valor sugerido por fonte externa (AcousticBrainz), não confirmado pelo DJ. Edite qualquer um dos 4 campos pra marcar como seu."
      data-audio-features-source={source}
    >
      sugestão · acousticbrainz
    </span>
  );
}
