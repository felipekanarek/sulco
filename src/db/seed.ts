/**
 * Seed de dev — insere um user fixture + 5 discos de exemplo
 * com tracklist mínima para smoke test de UI.
 *
 * Uso: `npm run db:reset` (drop + push + seed) ou `npm run db:seed`.
 *
 * Em prod (Turso) o seed NÃO é rodado — lá o onboarding real cria os
 * dados via Discogs.
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'file:./sulco.db';

async function main() {
  const client = createClient({ url: DATABASE_URL });
  const db = drizzle(client, { schema });

  // user fixture (clerkUserId estático — só bate se Clerk estiver
  // configurado com esse user, senão fica isolado)
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, 'user_seed_dev'))
    .limit(1);

  let userId: number;
  if (existing.length === 0) {
    const [u] = await db
      .insert(schema.users)
      .values({
        clerkUserId: 'user_seed_dev',
        email: 'seed@sulco.local',
        discogsUsername: 'seed',
        discogsCredentialStatus: 'valid',
      })
      .returning();
    userId = u.id;
    console.log(`Seed user criado id=${userId}`);
  } else {
    userId = existing[0].id;
    console.log(`Seed user já existe id=${userId} — skipping records.`);
    return;
  }

  const sample = [
    {
      discogsId: 900001,
      artist: 'Marcos Valle',
      title: 'Vento Sul',
      year: 1972,
      label: 'Odeon',
      format: 'LP, Album',
      genres: ['Jazz', 'Funk / Soul', 'Latin'],
      styles: ['Bossa Nova', 'MPB', 'Jazz-Funk'],
      tracks: [
        { position: 'A1', title: 'Bodas De Sangue', duration: '3:10' },
        { position: 'A2', title: 'Dez Leis', duration: '3:45' },
        { position: 'B1', title: 'Previsão', duration: '4:12' },
      ],
    },
    {
      discogsId: 900002,
      artist: 'Arthur Verocai',
      title: 'Arthur Verocai',
      year: 1972,
      label: 'Continental',
      format: 'LP, Album',
      genres: ['Jazz', 'Funk / Soul'],
      styles: ['MPB', 'Jazz-Funk'],
      tracks: [
        { position: 'A1', title: 'Caboclo', duration: '2:54' },
        { position: 'A2', title: 'Pelas Sombras', duration: '3:22' },
      ],
    },
    {
      discogsId: 900003,
      artist: 'Jorge Ben',
      title: 'Africa Brasil',
      year: 1976,
      label: 'Philips',
      format: 'LP, Album',
      genres: ['Funk / Soul', 'Latin'],
      styles: ['Samba', 'Afrobeat'],
      tracks: [
        { position: 'A1', title: 'Ponta De Lança Africano (Umbabarauma)', duration: '4:25' },
        { position: 'A2', title: 'Hermes Trismegisto E Sua Celeste Tábua De Esmeralda', duration: '4:02' },
        { position: 'B1', title: 'Xica Da Silva', duration: '3:15' },
      ],
    },
    {
      discogsId: 900004,
      artist: 'Azymuth',
      title: 'Light As A Feather',
      year: 1979,
      label: 'Milestone',
      format: 'LP, Album',
      genres: ['Jazz', 'Funk / Soul'],
      styles: ['Jazz-Funk', 'Fusion'],
      tracks: [
        { position: 'A1', title: 'Jazz Carnival', duration: '5:20' },
        { position: 'A2', title: 'Wait For My Turn', duration: '4:15' },
      ],
    },
    {
      discogsId: 900005,
      artist: 'Toto Bona Lokua',
      title: 'Toto Bona Lokua',
      year: 2004,
      label: 'No Format!',
      format: 'CD, Album',
      genres: ['Folk, World, & Country'],
      styles: ['African', 'Brazilian'],
      tracks: [{ position: '01', title: 'Yebu', duration: '3:30' }],
    },
  ];

  for (const r of sample) {
    const [rec] = await db
      .insert(schema.records)
      .values({
        userId,
        discogsId: r.discogsId,
        artist: r.artist,
        title: r.title,
        year: r.year,
        label: r.label,
        format: r.format,
        genres: r.genres,
        styles: r.styles,
        status: 'unrated',
      })
      .returning();

    // Primeiro disco (Marcos Valle): marca duas faixas como selected,
    // uma delas como Bomba, para popular autocomplete de vocab em dev.
    let index = 0;
    for (const t of r.tracks) {
      const isFirstRecordFirstTrack = rec.discogsId === 900001 && index === 0;
      const isFirstRecordSecond = rec.discogsId === 900001 && index === 1;
      await db.insert(schema.tracks).values({
        recordId: rec.id,
        position: t.position,
        title: t.title,
        duration: t.duration,
        selected: isFirstRecordFirstTrack || isFirstRecordSecond,
        bpm: isFirstRecordFirstTrack ? 112 : null,
        musicalKey: isFirstRecordFirstTrack ? '8A' : null,
        energy: isFirstRecordFirstTrack ? 3 : null,
        rating: isFirstRecordFirstTrack ? 3 : null,
        moods: isFirstRecordFirstTrack ? ['solar', 'festivo'] : [],
        contexts: isFirstRecordFirstTrack ? ['pico'] : [],
        isBomb: isFirstRecordFirstTrack,
      });
      index++;
    }
  }

  console.log(`Seed concluído: ${sample.length} records + tracks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
