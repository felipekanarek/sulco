/**
 * Vocabulário sugerido para `tracks.moods[]` e `tracks.contexts[]`.
 *
 * Estas constantes são a FONTE ÚNICA de sementes de autocomplete. Mescladas
 * com os termos já usados pelo DJ conforme FR-017a:
 *   1) termos do DJ em ordem de frequência descendente;
 *   2) sementes ainda não usadas, em ordem alfabética;
 *   dedup case-insensitive em ambos.
 *
 * Termos são normalizados com `normalizeVocabTerm()` antes de persistir ou
 * comparar (trim + lowercase).
 */

export const DEFAULT_MOOD_SEEDS: readonly string[] = [
  'solar',
  'festivo',
  'melancólico',
  'dançante',
  'profundo',
  'etéreo',
  'denso',
  'hipnótico',
  'emocional',
  'cru',
];

export const DEFAULT_CONTEXT_SEEDS: readonly string[] = [
  'pico',
  'warm up',
  'festa diurna',
  'after',
  'aquece',
  'fechamento',
  'drop',
  'transição',
];

/** Normalização canônica de termos de vocabulário. */
export function normalizeVocabTerm(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Constrói a lista ordenada de sugestões conforme FR-017a.
 *
 * @param userTerms termos já usados pelo DJ, com frequência (contagem de uso)
 * @param seeds lista de sementes (DEFAULT_MOOD_SEEDS ou DEFAULT_CONTEXT_SEEDS)
 * @returns lista ordenada, dedupada, para exibir no chip picker
 */
export function buildSuggestionList(
  userTerms: readonly { term: string; count: number }[],
  seeds: readonly string[],
): string[] {
  const normalizedUserTerms = userTerms
    .map(({ term, count }) => ({ term: normalizeVocabTerm(term), count }))
    .filter((t) => t.term.length > 0);

  // Dedup entre termos do usuário mantendo o maior count
  const userMap = new Map<string, number>();
  for (const { term, count } of normalizedUserTerms) {
    userMap.set(term, Math.max(userMap.get(term) ?? 0, count));
  }

  // Ordenar por count desc, desempate alfabético asc
  const userOrdered = Array.from(userMap.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([term]) => term);

  // Sementes que ainda não estão no set do usuário, em ordem alfabética
  const userSet = new Set(userOrdered);
  const seedsRemaining = seeds
    .map(normalizeVocabTerm)
    .filter((s) => !userSet.has(s))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return [...userOrdered, ...seedsRemaining];
}
