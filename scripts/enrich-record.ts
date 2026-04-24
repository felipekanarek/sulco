/**
 * Utilitário ad-hoc: dispara `enrichRecord(userId, recordId)` pela CLI.
 * Usado pelo quickstart.md §1 e por debugging manual.
 *
 * Uso:
 *   npx tsx scripts/enrich-record.ts <userId> <recordId>
 */

import { enrichRecord } from '../src/lib/acousticbrainz';

async function main() {
  const [userIdRaw, recordIdRaw] = process.argv.slice(2);
  const userId = Number(userIdRaw);
  const recordId = Number(recordIdRaw);

  if (!Number.isFinite(userId) || !Number.isFinite(recordId)) {
    console.error('Uso: npx tsx scripts/enrich-record.ts <userId> <recordId>');
    process.exit(1);
  }

  console.log(`[enrich-record] user=${userId} record=${recordId}`);
  const summary = await enrichRecord(userId, recordId);
  console.log('[enrich-record] resultado:', JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[enrich-record] FAIL', err);
    process.exit(1);
  });
