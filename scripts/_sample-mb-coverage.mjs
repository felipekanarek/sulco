/**
 * Sample N random records do Turso prod e mede cobertura MB+AB.
 * NÃO grava nada — só consulta. Dry-run.
 *
 * Uso:
 *   turso db tokens create sulco-prod --expiration 1d | tail -1 > /tmp/tt
 *   TURSO_TOKEN=$(cat /tmp/tt) node scripts/_sample-mb-coverage.mjs 50
 */

import { createClient } from '@libsql/client';

const N = Number(process.argv[2] ?? 50);
const UA = 'Sulco/0.1 ( marcus@infoprice.co )';
const MB_BASE = 'https://musicbrainz.org/ws/2';
const AB_BASE = 'https://acousticbrainz.org/api/v1';

const token = process.env.TURSO_TOKEN;
if (!token) {
  console.error('TURSO_TOKEN env var obrigatório');
  process.exit(1);
}

const db = createClient({
  url: 'libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io',
  authToken: token,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mbUrlLookup(discogsId) {
  const url = `${MB_BASE}/url?resource=${encodeURIComponent(`https://www.discogs.com/release/${discogsId}`)}&inc=release-rels&fmt=json`;
  await sleep(1100);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MB ${res.status}`);
  const body = await res.json();
  const rel = body.relations?.find((r) => r.type === 'discogs' && r.release?.id);
  return rel?.release?.id ?? null;
}

async function mbReleaseRecordings(mbReleaseId) {
  await sleep(1100);
  const res = await fetch(`${MB_BASE}/release/${mbReleaseId}?inc=recordings&fmt=json`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const body = await res.json();
  const recordings = [];
  for (const medium of body.media ?? []) {
    for (const track of medium.tracks ?? []) {
      if (track.recording?.id) recordings.push(track.recording.id);
    }
  }
  return recordings;
}

async function abHasData(mbid) {
  await sleep(500);
  const res = await fetch(`${AB_BASE}/${mbid}/low-level`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  return res.status === 200;
}

async function main() {
  const url = "libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io";
  console.log(`[sample] buscando ${N} records aleatórios em ${url.slice(0, 40)}...`);

  const rows = await db.execute({
    sql: `SELECT id, discogs_id, artist, title, year
          FROM records
          WHERE user_id = 2 AND archived = 0
          ORDER BY RANDOM()
          LIMIT ?`,
    args: [N],
  });

  console.log(`[sample] ${rows.rows.length} discos sorteados\n`);

  let mbMatches = 0;
  let mbReleasesFetched = 0;
  let abTrackSamples = 0;
  let abTrackHits = 0;
  const misses = [];
  const hits = [];

  for (let i = 0; i < rows.rows.length; i++) {
    const r = rows.rows[i];
    const idx = `[${i + 1}/${rows.rows.length}]`;
    try {
      const mbid = await mbUrlLookup(r.discogs_id);
      if (!mbid) {
        console.log(`${idx} ❌ ${r.artist} - ${r.title} (${r.year || '?'})`);
        misses.push(`${r.artist} - ${r.title} (${r.year || '?'})`);
        continue;
      }
      mbMatches++;
      // Pega recordings e testa AB só na PRIMEIRA recording pra amostra
      // (evita explosão de requests).
      const recordings = await mbReleaseRecordings(mbid);
      mbReleasesFetched++;
      const sampleMbid = recordings[0];
      let abFlag = '?';
      if (sampleMbid) {
        abTrackSamples++;
        const hasAb = await abHasData(sampleMbid);
        if (hasAb) {
          abTrackHits++;
          abFlag = 'AB:sim';
        } else {
          abFlag = 'AB:não';
        }
      }
      console.log(`${idx} ✅ ${r.artist} - ${r.title} (${r.year || '?'}) [${recordings.length} rec · ${abFlag}]`);
      hits.push({ artist: r.artist, title: r.title, recordings: recordings.length, ab: abFlag });
    } catch (err) {
      console.log(`${idx} ⚠️  ${r.artist} - ${r.title} [erro: ${err.message}]`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESUMO');
  console.log('='.repeat(60));
  console.log(`Total amostrado:       ${rows.rows.length}`);
  console.log(`MB match:              ${mbMatches} (${Math.round((mbMatches / rows.rows.length) * 100)}%)`);
  console.log(`MB sem match:          ${rows.rows.length - mbMatches}`);
  console.log(`AB data (1ª recording): ${abTrackHits} / ${abTrackSamples} (${abTrackSamples ? Math.round((abTrackHits / abTrackSamples) * 100) : 0}%)`);
  if (misses.length > 0) {
    console.log('\nSample de MISSES (não mapeados no MB):');
    for (const m of misses.slice(0, 10)) console.log(`  · ${m}`);
    if (misses.length > 10) console.log(`  ... e mais ${misses.length - 10}`);
  }
}

main()
  .then(() => db.close())
  .catch((err) => {
    console.error('FAIL', err);
    db.close();
    process.exit(1);
  });
