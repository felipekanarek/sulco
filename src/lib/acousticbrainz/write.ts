import 'server-only';

// Null-guard writer pra enriquecimento. Princípio I NON-NEGOTIABLE:
// UPDATE ... WHERE audio_features_source IS NULL + COALESCE por campo.
// Ver data-model.md §"Regras de escrita".

import { sql } from 'drizzle-orm';
import { db } from '@/db';

export type EnrichPayload = {
  mbid?: string | null;
  bpm?: number | null;
  camelot?: string | null;
  energy?: number | null;
  moods?: string[] | null;
  source: 'acousticbrainz';
};

/**
 * Aplica sugestão externa em track respeitando Princípio I.
 *
 * Constituição III: SQL raw é necessário aqui porque Drizzle query
 * builder não expressa naturalmente COALESCE condicional em 5 colunas
 * de uma só vez dentro de um único UPDATE atômico. A cláusula
 * `WHERE audio_features_source IS NULL` garante defesa em profundidade:
 * se o DJ (ou migração) já marcou a track como 'manual', o UPDATE
 * afeta zero linhas e o teste de regressão (T020) falha explicitamente.
 *
 * Retorna `true` se pelo menos uma linha foi alterada.
 */
export async function writeEnrichment(
  trackId: number,
  payload: EnrichPayload,
): Promise<boolean> {
  const moodsJson = payload.moods && payload.moods.length > 0 ? JSON.stringify(payload.moods) : null;

  const result = await db.run(sql`
    UPDATE tracks
    SET
      bpm = COALESCE(bpm, ${payload.bpm ?? null}),
      musical_key = COALESCE(musical_key, ${payload.camelot ?? null}),
      energy = COALESCE(energy, ${payload.energy ?? null}),
      moods = CASE
        WHEN (moods IS NULL OR moods = '[]') AND ${moodsJson} IS NOT NULL THEN ${moodsJson}
        ELSE moods
      END,
      mbid = COALESCE(mbid, ${payload.mbid ?? null}),
      audio_features_source = ${payload.source},
      audio_features_synced_at = unixepoch()
    WHERE id = ${trackId}
      AND audio_features_source IS NULL
  `);

  // libsql result.rowsAffected (number) ou result.changes dependendo do driver.
  const affected = (result as { rowsAffected?: number; changes?: number }).rowsAffected
    ?? (result as { rowsAffected?: number; changes?: number }).changes
    ?? 0;
  return affected > 0;
}

/**
 * Atualiza apenas `audio_features_synced_at` (+ opcionalmente `mbid`)
 * sem tocar em nenhum campo autoral. Usado quando a tentativa foi
 * feita mas não houve dado externo pra gravar (404 em AB, sem MBID, etc).
 *
 * Respeita Princípio I — não altera source se for 'manual'.
 */
export async function markTrackSyncAttempt(
  trackId: number,
  mbid: string | null,
): Promise<void> {
  await db.run(sql`
    UPDATE tracks
    SET
      mbid = COALESCE(mbid, ${mbid}),
      audio_features_synced_at = unixepoch()
    WHERE id = ${trackId}
      AND audio_features_source IS NULL
  `);
}
