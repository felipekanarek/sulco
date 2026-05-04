import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { recordGenres, recordStyles, recordFormats, trackMoods, trackContexts } from '@/db/schema';

/**
 * Inc 35 (030) — Helper privado para aplicar delta direcionado em
 * tabelas pivot de filtros multi-select.
 *
 * Substitui `EXISTS json_each(...)` por subqueries indexadas.
 * Usado por:
 * - `applyDiscogsUpdate` (sync) → record_genres, record_styles
 * - `updateTrackCuration` (DJ edit) → track_moods, track_contexts
 *
 * Comportamento:
 * 1. Filtra empty/whitespace de added/removed.
 * 2. Se ambos vazios → no-op (zero queries).
 * 3. DELETE removidos (1 query batched).
 * 4. INSERT added com onConflictDoNothing (1 query batched).
 *
 * Idempotente: re-execução com mesmos args produz mesmo estado.
 * `onConflictDoNothing` cobre race entre 2 paths concorrentes.
 *
 * Custo: ≤2 queries por chamada (ou 0 se ambos vazios).
 */

type PivotTable =
  | typeof recordGenres
  | typeof recordStyles
  | typeof recordFormats
  | typeof trackMoods
  | typeof trackContexts;

export async function applyPivotDelta(
  table: PivotTable,
  fkColumn: 'recordId' | 'trackId',
  valueColumn: 'genre' | 'style' | 'token' | 'mood' | 'context',
  fkId: number,
  added: string[],
  removed: string[],
): Promise<void> {
  const cleanAdded = added.filter(
    (t) => typeof t === 'string' && t.trim().length > 0,
  );
  const cleanRemoved = removed.filter(
    (t) => typeof t === 'string' && t.trim().length > 0,
  );

  if (cleanAdded.length === 0 && cleanRemoved.length === 0) return;

  // DELETE removidos
  if (cleanRemoved.length > 0) {
    const fkCol = (table as unknown as Record<string, never>)[fkColumn];
    const valCol = (table as unknown as Record<string, never>)[valueColumn];
    await db
      .delete(table)
      .where(and(eq(fkCol, fkId), inArray(valCol, cleanRemoved)));
  }

  // INSERT added
  if (cleanAdded.length > 0) {
    const values = cleanAdded.map((v) => ({
      [fkColumn]: fkId,
      [valueColumn]: v,
    }));
    await db
      .insert(table)
      .values(values as never)
      .onConflictDoNothing();
  }
}
