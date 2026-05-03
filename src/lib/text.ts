/**
 * Helpers de comparação textual usados em buscas de coleção e
 * candidatos (Inc 18 / 021).
 *
 * Estratégia: normalizar ambos os lados (termo digitado + valor
 * armazenado) removendo diacríticos antes de comparar, garantindo
 * busca insensitive a acentos. SQLite/Turso não tem `unaccent`
 * nativo — fazemos isso em JS pós-query.
 */

/**
 * Normaliza texto para comparação accent-insensitive +
 * case-insensitive.
 *
 * - lowercase: case-insensitive
 * - NFD: decompõe `é` em `e + ́` (combining acute)
 * - strip combining marks (`\p{M}`): remove qualquer mark
 *   diacrítico, cobrindo todos os blocos Unicode (pt-BR,
 *   francês, vietnamita…).
 *
 * Pure function. Sem side-effects. Determinístico.
 */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Retorna `true` se algum dos `haystacks` (após normalize) contém
 * o `query` (após normalize). null/undefined em haystacks são
 * tratados como string vazia (no-match).
 *
 * Empty/whitespace query retorna `true` — caller deve filtrar
 * antes se quiser ignorar query vazia.
 */
export function matchesNormalizedText(
  haystacks: ReadonlyArray<string | null | undefined>,
  query: string,
): boolean {
  const needle = normalizeText(query).trim();
  if (needle.length === 0) return true;
  for (const h of haystacks) {
    if (normalizeText(h).includes(needle)) return true;
  }
  return false;
}

/**
 * Compõe a string `search_text` materializada em `records` (Inc 32).
 *
 * Concatena `artist + ' ' + title + ' ' + (label ?? '')` e aplica
 * `normalizeText`. Determinístico: mesma input → mesma output.
 * Pode rodar múltiplas vezes sem divergir (idempotente para
 * backfill).
 *
 * Usado por:
 * - `applyDiscogsUpdate` em src/lib/discogs/apply-update.ts (sync)
 * - `runInitialImport` em src/lib/discogs/import.ts (import)
 * - `scripts/_backfill-search-text.mjs` (backfill — re-implementa
 *   inline pois script Node não importa de TS)
 */
export function computeRecordSearchText(
  artist: string,
  title: string,
  label: string | null,
): string {
  return normalizeText([artist, title, label ?? ''].join(' '));
}
