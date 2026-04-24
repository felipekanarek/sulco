import 'server-only';

// Filtro de moods do AcousticBrainz high-level.
// Threshold ≥0.7, persiste termos em inglês sem tradução (FR-009).
// Ver research.md §5.

type HighLevelEntry = { probability: number; value: string };

export type ABHighLevel = Partial<{
  mood_acoustic: HighLevelEntry;
  mood_aggressive: HighLevelEntry;
  mood_electronic: HighLevelEntry;
  mood_happy: HighLevelEntry;
  mood_party: HighLevelEntry;
  mood_relaxed: HighLevelEntry;
  mood_sad: HighLevelEntry;
  // Ignorados de propósito: não são "moods" no sentido DJ.
  danceability?: HighLevelEntry;
  tonal_atonal?: HighLevelEntry;
}>;

const MOOD_KEYS = [
  'mood_acoustic',
  'mood_aggressive',
  'mood_electronic',
  'mood_happy',
  'mood_party',
  'mood_relaxed',
  'mood_sad',
] as const;

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Seleciona moods com alta confiança (probability ≥ 0.7) do payload
 * high-level do AcousticBrainz.
 *
 * - Descarta `danceability` e `tonal_atonal` (não são moods).
 * - Só inclui quando `value` começa com o nome positivo (ex. `happy`,
 *   não `not_happy`).
 * - Remove prefixo `mood_` → `happy`, `aggressive`, `electronic`…
 * - Retorna array ordenado alfabeticamente.
 */
export function selectMoods(highlevel: ABHighLevel | null | undefined): string[] {
  if (!highlevel) return [];

  const selected: string[] = [];
  for (const key of MOOD_KEYS) {
    const entry = highlevel[key];
    if (!entry) continue;
    if (typeof entry.probability !== 'number' || entry.probability < CONFIDENCE_THRESHOLD) continue;
    if (typeof entry.value !== 'string') continue;
    // Filtra valores "negativos" (ex. "not_happy"): AB high-level tem
    // o formato `{ value: 'happy' | 'not_happy', probability }` — só
    // nos interessa quando `value` é o termo positivo.
    const positive = key.replace(/^mood_/, '');
    if (entry.value !== positive) continue;
    selected.push(positive);
  }
  return selected.sort();
}
