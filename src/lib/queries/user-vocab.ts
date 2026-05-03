import 'server-only';
import { cache } from 'react';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { userVocab } from '@/db/schema';

/**
 * Inc 33 — Vocabulário materializado por user × kind × term com
 * counters incrementais. Substitui as 5 colunas JSON em
 * `user_facets` (`*Json`) que exigiam scan da coleção a cada
 * leitura/escrita.
 *
 * Ver:
 * - spec: specs/028-user-vocab-table/spec.md
 * - contract: specs/028-user-vocab-table/contracts/user-vocab-helpers.md
 */

export type VocabKind = 'genres' | 'styles' | 'moods' | 'contexts' | 'shelves';
export type VocabEntry = { term: string; count: number };

/**
 * Lê o vocabulário materializado de um user para um kind específico.
 *
 * - Cached request-scoped via `react.cache` (Decisão 6 do research):
 *   dedup automático no mesmo render mesmo que múltiplos RSCs paralelos
 *   chamem com mesmo (userId, kind).
 * - Retorna apenas termos com `ref_count > 0` (entries com 0 são
 *   deletadas no cleanup, então o filtro é implícito).
 * - Ordem: `ref_count DESC, lower(term) ASC` — termos mais usados
 *   primeiro, desempate alfabético case-insensitive.
 *
 * Custo: 1 SELECT contra `user_vocab_user_kind_idx`. ~15-30 rows
 * típicos por (user, kind).
 */
export const listVocab = cache(
  async (userId: number, kind: VocabKind): Promise<VocabEntry[]> => {
    const rows = await db
      .select({ term: userVocab.term, count: userVocab.refCount })
      .from(userVocab)
      .where(and(eq(userVocab.userId, userId), eq(userVocab.kind, kind)))
      .orderBy(sql`${userVocab.refCount} DESC, lower(${userVocab.term}) ASC`);
    return rows.map((r) => ({ term: r.term, count: r.count }));
  },
);

/**
 * Diff entre duas listas de termos — utility puro O(N+M).
 *
 * Determina quais termos foram adicionados (estão em `newArr` mas
 * não em `oldArr`) e quais foram removidos (estão em `oldArr` mas
 * não em `newArr`). Termos duplicados na mesma lista são tratados
 * via Set (cada termo aparece 1× no resultado).
 */
export function diffVocabArrays(
  oldArr: string[],
  newArr: string[],
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((t) => !oldSet.has(t)),
    removed: oldArr.filter((t) => !newSet.has(t)),
  };
}

/**
 * Aplica delta direcionado ao vocabulário de um user × kind.
 *
 * - Para cada `term` em `added`: UPSERT atomic (`ON CONFLICT DO UPDATE`)
 *   incrementando `ref_count`. Cria entry se não existir (ref_count=1).
 * - Para cada `term` em `removed`: UPDATE com clamp em 0
 *   (`MAX(0, ref_count - 1)`).
 * - Após todos UPDATEs, 1 cleanup `DELETE WHERE ref_count = 0` —
 *   remove entries que zeraram. Limpa também drift latente eventual.
 *
 * Filtra termos vazios/whitespace (defensivo).
 *
 * Idempotente em estrutura: drift residual é capturado pelo cron
 * noturno (`recomputeFacets` re-popula vocab do zero).
 */
export async function applyVocabDelta(
  userId: number,
  kind: VocabKind,
  added: string[],
  removed: string[],
): Promise<void> {
  const cleanAdded = added.filter((t) => typeof t === 'string' && t.trim().length > 0);
  const cleanRemoved = removed.filter((t) => typeof t === 'string' && t.trim().length > 0);

  if (cleanAdded.length === 0 && cleanRemoved.length === 0) return;

  // Increment via UPSERT atomic — sem race entre SELECT e UPDATE.
  for (const term of cleanAdded) {
    await db
      .insert(userVocab)
      .values({
        userId,
        kind,
        term,
        refCount: 1,
      })
      .onConflictDoUpdate({
        target: [userVocab.userId, userVocab.kind, userVocab.term],
        set: {
          refCount: sql`${userVocab.refCount} + 1`,
          updatedAt: sql`(unixepoch())`,
        },
      });
  }

  // Decrement com clamp em 0 — defensivo contra drift.
  for (const term of cleanRemoved) {
    await db
      .update(userVocab)
      .set({
        refCount: sql`MAX(0, ${userVocab.refCount} - 1)`,
        updatedAt: sql`(unixepoch())`,
      })
      .where(
        and(
          eq(userVocab.userId, userId),
          eq(userVocab.kind, kind),
          eq(userVocab.term, term),
        ),
      );
  }

  // Cleanup de zerados (1× ao fim, cobre múltiplos decrements + drift).
  if (cleanRemoved.length > 0) {
    await db
      .delete(userVocab)
      .where(
        and(
          eq(userVocab.userId, userId),
          eq(userVocab.kind, kind),
          eq(userVocab.refCount, 0),
        ),
      );
  }
}
