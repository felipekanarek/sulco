/**
 * Inc 36 (033): tokenizador do `records.format` do Discogs.
 *
 * Discogs envia composite ("Vinyl, LP, Album, Stereo") como string única.
 * Esta função extrai os tokens base ("Vinyl", "LP", "Album", "Stereo")
 * que alimentam:
 * - pivot `record_formats` (Inc 36)
 * - kind `formats` em `user_vocab` (Inc 8)
 *
 * Comportamento:
 * - Split por vírgula.
 * - `trim` em cada token.
 * - Filtra empty/whitespace-only (Princípio: vocab limpo).
 *
 * Princípio VI (Cobertura de Testes): coberta por
 * [tests/unit/format-tokens.test.ts](../../tests/unit/format-tokens.test.ts).
 */
export function tokenizeFormat(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
