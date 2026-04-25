/**
 * Roda enrichRecord pra uma lista de record IDs em batch.
 * Usa o cliente Turso direto + clientes MB/AB direto (sem passar pelo
 * 'server-only'). Reproduz a lógica do enrichRecord pra debug/medição
 * de cobertura sem subir Next.
 *
 * Uso: TURSO_TOKEN=... node scripts/_enrich-batch.mjs <countryFilter|recordIdsCSV>
 *   - se valor parece CSV de números → trata como IDs específicos
 *   - se for string → trata como country filter (ex. 'US' ou '!Brazil')
 *
 * Não modifica DB se DRY_RUN=1.
 */

import { createClient } from '@libsql/client';

const arg = process.argv[2] ?? '!Brazil';
const DRY_RUN = process.env.DRY_RUN === '1';
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

// ---------- Camelot mapping (espelho de src/lib/acousticbrainz/camelot.ts) ----------
const MAJOR = { C:'8B','C#':'3B',Db:'3B',D:'10B','D#':'5B',Eb:'5B',E:'12B',F:'7B','F#':'2B',Gb:'2B',G:'9B','G#':'4B',Ab:'4B',A:'11B','A#':'6B',Bb:'6B',B:'1B' };
const MINOR = { C:'5A','C#':'12A',Db:'12A',D:'7A','D#':'2A',Eb:'2A',E:'9A',F:'4A','F#':'11A',Gb:'11A',G:'6A','G#':'1A',Ab:'1A',A:'8A','A#':'3A',Bb:'3A',B:'10A' };
const toCamelot = (k, s) => !k || !s ? null : (s === 'major' ? MAJOR[k] : s === 'minor' ? MINOR[k] : null) ?? null;

// ---------- MB clients ----------
async function mbUrlLookup(discogsId) {
  await sleep(1100);
  const r = await fetch(`${MB_BASE}/url?resource=${encodeURIComponent(`https://www.discogs.com/release/${discogsId}`)}&inc=release-rels&fmt=json`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`MB ${r.status}`);
  const b = await r.json();
  return b.relations?.find((rel) => rel.type === 'discogs' && rel.release?.id)?.release?.id ?? null;
}

function normalize(s) {
  return s.toLowerCase().replace(/[''"`.,!?():;\[\]–—-]/g, ' ').replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
}

async function mbSearchByArtistTitle(artist, title, expectedCount) {
  await sleep(1100);
  const escape = (s) => s.replace(/["\\]/g, ' ').trim();
  const q = `artist:"${escape(artist)}" AND release:"${escape(title)}"`;
  const r = await fetch(`${MB_BASE}/release?query=${encodeURIComponent(q)}&fmt=json&limit=10`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) return null;
  const b = await r.json();
  const cands = (b.releases ?? []).filter((rel) => {
    if (typeof rel.score === 'number' && rel.score < 95) return false;
    const mbArtist = rel['artist-credit']?.[0]?.name ?? '';
    return normalize(mbArtist) === normalize(artist);
  });
  if (cands.length === 0) return null;
  if (expectedCount) {
    const exact = cands.find((rel) => rel['track-count'] === expectedCount);
    if (exact) return exact.id;
  }
  return cands[0].id;
}

function matchByPositionOrTitle(sulcoPos, sulcoTitle, mbRefs) {
  // Tier 1: position match (simple normalize)
  const np = (p) => { const m = p.match(/([A-Za-z]+)?(\d+)/); return m ? `${(m[1] ?? '').toUpperCase()}${parseInt(m[2], 10)}` : p.toUpperCase(); };
  const target = np(sulcoPos);
  const byPos = mbRefs.find((r) => np(r.position) === target);
  if (byPos) return byPos.mbid;
  // Tier 2: title fallback (must be unique)
  const t = normalize(sulcoTitle);
  if (!t) return null;
  const byTitle = mbRefs.filter((r) => normalize(r.title) === t);
  return byTitle.length === 1 ? byTitle[0].mbid : null;
}

async function mbRecordings(mbReleaseId) {
  await sleep(1100);
  const r = await fetch(`${MB_BASE}/release/${mbReleaseId}?inc=recordings&fmt=json`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) return [];
  const b = await r.json();
  const refs = [];
  for (const m of b.media ?? []) for (const t of m.tracks ?? []) {
    if (t.recording?.id && t.number) {
      const title = t.title ?? t.recording?.title ?? '';
      refs.push({ position: t.number, title, mbid: t.recording.id });
    }
  }
  return refs;
}

async function abFetch(mbid) {
  await sleep(500);
  const lo = await fetch(`${AB_BASE}/${mbid}/low-level`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (lo.status === 404) return null;
  if (!lo.ok) return null;
  const lowLevel = await lo.json();
  await sleep(500);
  const hi = await fetch(`${AB_BASE}/${mbid}/high-level`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const highLevel = hi.ok ? await hi.json() : null;
  const bpm = lowLevel?.rhythm?.bpm;
  const camelot = toCamelot(lowLevel?.tonal?.key_key, lowLevel?.tonal?.key_scale);
  const moodAgg = highLevel?.highlevel?.mood_aggressive?.probability;
  const energy = (typeof moodAgg === 'number' && moodAgg >= 0 && moodAgg <= 1) ? Math.max(1, Math.ceil(moodAgg * 5)) : null;
  const moodKeys = ['mood_acoustic','mood_aggressive','mood_electronic','mood_happy','mood_party','mood_relaxed','mood_sad'];
  const moods = highLevel?.highlevel ? moodKeys.flatMap((k) => {
    const e = highLevel.highlevel[k];
    if (!e || typeof e.probability !== 'number' || e.probability < 0.7) return [];
    const positive = k.replace('mood_','');
    return e.value === positive ? [positive] : [];
  }).sort() : [];
  return { bpm: typeof bpm === 'number' ? Math.round(bpm) : null, camelot, energy, moods };
}


// ---------- Main ----------
async function main() {
  let records;
  if (/^\d+(,\d+)*$/.test(arg)) {
    const ids = arg.split(',').map(Number);
    records = await db.execute({
      sql: `SELECT id, discogs_id, artist, title, year, country FROM records WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id = 2 AND archived = 0`,
      args: ids,
    });
  } else if (arg.startsWith('!')) {
    records = await db.execute({
      sql: `SELECT id, discogs_id, artist, title, year, country FROM records WHERE user_id = 2 AND archived = 0 AND (country IS NULL OR country != ?) ORDER BY country, artist`,
      args: [arg.slice(1)],
    });
  } else {
    records = await db.execute({
      sql: `SELECT id, discogs_id, artist, title, year, country FROM records WHERE user_id = 2 AND archived = 0 AND country = ? ORDER BY artist`,
      args: [arg],
    });
  }

  console.log(`[batch] ${records.rows.length} discos pra processar (DRY_RUN=${DRY_RUN ? 'sim' : 'não'})\n`);

  const stats = { total: records.rows.length, mbMatched: 0, recordsWithAnyAb: 0, tracksUpdated: 0, tracksSkipped: 0 };
  const sampleHits = [];

  for (let i = 0; i < records.rows.length; i++) {
    const r = records.rows[i];
    const idx = `[${String(i + 1).padStart(3)}/${records.rows.length}]`;
    try {
      // Conta tracks pra search ranking
      const sulcoTracks = await db.execute({
        sql: `SELECT id, position, title, audio_features_source FROM tracks WHERE record_id = ? ORDER BY position`,
        args: [r.id],
      });
      // Tier 1: URL lookup
      let mbid = await mbUrlLookup(r.discogs_id);
      let foundVia = 'url';
      // Tier 2: artist+title search
      if (!mbid) {
        mbid = await mbSearchByArtistTitle(r.artist, r.title, sulcoTracks.rows.length);
        foundVia = mbid ? 'search' : 'none';
      }
      if (!mbid) {
        console.log(`${idx} ❌ ${r.country} · ${r.artist} - ${r.title} (${r.year || '?'})`);
        continue;
      }
      stats.mbMatched++;
      const mbRefs = await mbRecordings(mbid);
      let updatedNow = 0;
      let skippedNow = 0;
      const trackHits = [];
      for (const st of sulcoTracks.rows) {
        if (st.audio_features_source) { skippedNow++; continue; }
        const recMbid = matchByPositionOrTitle(st.position, st.title, mbRefs);
        if (!recMbid) { skippedNow++; continue; }
        const feats = await abFetch(recMbid);
        if (!feats || (feats.bpm == null && feats.camelot == null && feats.energy == null && feats.moods.length === 0)) {
          skippedNow++; continue;
        }
        if (!DRY_RUN) {
          // null-guard write
          const moodsJson = feats.moods.length > 0 ? JSON.stringify(feats.moods) : null;
          await db.execute({
            sql: `UPDATE tracks
                  SET bpm = COALESCE(bpm, ?),
                      musical_key = COALESCE(musical_key, ?),
                      energy = COALESCE(energy, ?),
                      moods = CASE WHEN (moods IS NULL OR moods = '[]') AND ? IS NOT NULL THEN ? ELSE moods END,
                      mbid = COALESCE(mbid, ?),
                      audio_features_source = 'acousticbrainz',
                      audio_features_synced_at = unixepoch()
                  WHERE id = ? AND audio_features_source IS NULL`,
            args: [feats.bpm, feats.camelot, feats.energy, moodsJson, moodsJson, recMbid, st.id],
          });
        }
        updatedNow++;
        trackHits.push(`${st.position}=${feats.bpm}/${feats.camelot}/${feats.energy}`);
      }
      stats.tracksUpdated += updatedNow;
      stats.tracksSkipped += skippedNow;
      if (updatedNow > 0) {
        stats.recordsWithAnyAb++;
        sampleHits.push({ artist: r.artist, title: r.title, year: r.year, country: r.country, updated: updatedNow, total: sulcoTracks.rows.length, sample: trackHits.slice(0, 3).join(' · '), via: foundVia });
        console.log(`${idx} ✅(${foundVia}) ${r.country} · ${r.artist} - ${r.title} (${r.year || '?'})  [${updatedNow}/${sulcoTracks.rows.length} faixas]  ${trackHits.slice(0, 2).join(' · ')}`);
      } else {
        console.log(`${idx} ⚪(${foundVia}) ${r.country} · ${r.artist} - ${r.title} (${r.year || '?'})  [match MB mas zero AB]`);
      }
    } catch (err) {
      console.log(`${idx} ⚠️  ${r.artist} - ${r.title}  ERRO: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('RESUMO');
  console.log('='.repeat(70));
  console.log(`Discos amostrados:           ${stats.total}`);
  console.log(`MB match:                    ${stats.mbMatched} (${Math.round(stats.mbMatched/stats.total*100)}%)`);
  console.log(`Discos com >=1 faixa AB:     ${stats.recordsWithAnyAb} (${Math.round(stats.recordsWithAnyAb/stats.total*100)}%)`);
  console.log(`Faixas enriquecidas:         ${stats.tracksUpdated}`);
  console.log(`Faixas skipped (sem dado):   ${stats.tracksSkipped}`);
  console.log(`Modo:                        ${DRY_RUN ? 'DRY RUN (nada gravado)' : 'GRAVOU em prod'}`);

  if (sampleHits.length > 0) {
    console.log('\nDestaques (até 10 primeiros):');
    sampleHits.slice(0, 10).forEach(h => {
      console.log(`  ${h.country} · ${h.artist} - ${h.title} (${h.year}) — ${h.updated}/${h.total} faixas`);
      console.log(`    sample: ${h.sample}`);
    });
  }
}

main()
  .then(() => db.close())
  .catch((err) => { console.error('FAIL', err); db.close(); process.exit(1); });
