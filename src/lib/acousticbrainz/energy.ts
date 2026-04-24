import 'server-only';

// Derivação de energy (1..5) a partir de mood_aggressive.probability
// do AcousticBrainz high-level. Ver research.md §4.

/**
 * Mapeia probabilidade contínua [0..1] pra bucket inteiro [1..5].
 * Entrada `null`/`undefined`/fora do range → retorna `null`.
 *
 * Regra: `Math.max(1, Math.ceil(p * 5))`. Ex:
 *   0.0  → 1
 *   0.19 → 1
 *   0.21 → 2
 *   0.40 → 2
 *   0.60 → 3
 *   0.80 → 4
 *   1.00 → 5
 */
export function deriveEnergy(moodAggressiveProb: number | null | undefined): number | null {
  if (moodAggressiveProb == null) return null;
  if (!Number.isFinite(moodAggressiveProb)) return null;
  if (moodAggressiveProb < 0 || moodAggressiveProb > 1) return null;
  return Math.max(1, Math.ceil(moodAggressiveProb * 5));
}
