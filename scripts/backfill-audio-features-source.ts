/**
 * Backfill one-shot pra Princípio I retroativo (spec 005, T004a).
 *
 * Marca como `audio_features_source = 'manual'` toda track que tinha
 * algum campo de audio features preenchido ANTES da feature 005 — caso
 * contrário a primeira execução do enrich rotularia dados curados
 * pelo DJ como "sugestão externa" (violação visual de Princípio I).
 *
 * Idempotente — re-execução afeta zero linhas.
 *
 * Uso:
 *   npx tsx scripts/backfill-audio-features-source.ts
 *
 * OBRIGATÓRIO rodar uma vez em cada ambiente antes do primeiro
 * enrich run (cron diário ou trigger imediato).
 */

import { sql } from 'drizzle-orm';
import { db } from '../src/db';

async function main() {
  const before = await db.get<{ count: number }>(sql`
    SELECT COUNT(*) AS count
    FROM tracks
    WHERE audio_features_source IS NULL
      AND (
        bpm IS NOT NULL
        OR musical_key IS NOT NULL
        OR energy IS NOT NULL
        OR (moods IS NOT NULL AND moods <> '[]')
      );
  `);
  const candidates = before?.count ?? 0;

  console.log(`[backfill] ${candidates} tracks elegíveis para marcar como 'manual'`);

  if (candidates === 0) {
    console.log('[backfill] Nada a fazer. Exiting.');
    return;
  }

  await db.run(sql`
    UPDATE tracks
    SET audio_features_source = 'manual'
    WHERE audio_features_source IS NULL
      AND (
        bpm IS NOT NULL
        OR musical_key IS NOT NULL
        OR energy IS NOT NULL
        OR (moods IS NOT NULL AND moods <> '[]')
      );
  `);

  const after = await db.get<{ count: number }>(sql`
    SELECT COUNT(*) AS count
    FROM tracks
    WHERE audio_features_source = 'manual';
  `);

  console.log(`[backfill] OK — ${after?.count ?? 0} tracks agora têm source='manual'.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] FAIL', err);
    process.exit(1);
  });
