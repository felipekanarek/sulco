import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

/* ============================================================
   DISCO — espelho do Discogs + campos autorais de DJ
   ============================================================ */
export const records = sqliteTable('records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // espelho Discogs
  discogsId: integer('discogs_id').unique(),
  artist: text('artist').notNull(),
  title: text('title').notNull(),
  year: integer('year'),
  label: text('label'),
  country: text('country'),
  format: text('format'),         // "LP", "2xLP, Album"
  coverUrl: text('cover_url'),
  genres: text('genres', { mode: 'json' }).$type<string[]>().default([]),
  styles: text('styles', { mode: 'json' }).$type<string[]>().default([]),
  // campos autorais
  status: text('status', { enum: ['unrated', 'active', 'discarded'] }).notNull().default('unrated'),
  curated: integer('curated', { mode: 'boolean' }).notNull().default(false),
  curatedAt: integer('curated_at', { mode: 'timestamp' }),
  shelfLocation: text('shelf_location'), // ex: "E3-P2"
  notes: text('notes'),
  // metadados
  importedAt: integer('imported_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

/* ============================================================
   FAIXA — tracklist do Discogs + curadoria do DJ
   ============================================================ */
export const tracks = sqliteTable('tracks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recordId: integer('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  // espelho Discogs
  position: text('position').notNull(),    // "A1", "B2"
  title: text('title').notNull(),
  duration: text('duration'),              // "5:23"
  // curadoria
  selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
  rating: integer('rating'),               // 1 = +, 2 = ++, 3 = +++
  bpm: integer('bpm'),
  musicalKey: text('musical_key'),         // "Am" ou "8A"
  energy: integer('energy'),               // 1..5
  moods: text('moods', { mode: 'json' }).$type<string[]>().default([]),
  contexts: text('contexts', { mode: 'json' }).$type<string[]>().default([]),
  fineGenre: text('fine_genre'),           // texto livre: "jazz modal"
  references: text('references'),          // "lembra Floating Points"
  comment: text('comment'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

/* ============================================================
   SET — evento específico com briefing
   ============================================================ */
export const sets = sqliteTable('sets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  eventDate: integer('event_date', { mode: 'timestamp' }),
  location: text('location'),
  briefing: text('briefing'),
  status: text('status', { enum: ['draft', 'scheduled', 'done'] }).notNull().default('draft'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

/* tabela de junção: faixas de um set, com ordem */
export const setTracks = sqliteTable('set_tracks', {
  setId: integer('set_id').notNull().references(() => sets.id, { onDelete: 'cascade' }),
  trackId: integer('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.setId, t.trackId] }) }));

/* ============================================================
   PLAYLIST — bloco reutilizável de faixas
   ============================================================ */
export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const playlistTracks = sqliteTable('playlist_tracks', {
  playlistId: integer('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  trackId: integer('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.playlistId, t.trackId] }) }));

/* ============================================================
   Relações (para joins com o query builder relacional)
   ============================================================ */
export const recordsRelations = relations(records, ({ many }) => ({
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  record: one(records, { fields: [tracks.recordId], references: [records.id] }),
  setTracks: many(setTracks),
  playlistTracks: many(playlistTracks),
}));

export const setsRelations = relations(sets, ({ many }) => ({
  setTracks: many(setTracks),
}));

export const setTracksRelations = relations(setTracks, ({ one }) => ({
  set: one(sets, { fields: [setTracks.setId], references: [sets.id] }),
  track: one(tracks, { fields: [setTracks.trackId], references: [tracks.id] }),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
  playlistTracks: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, { fields: [playlistTracks.playlistId], references: [playlists.id] }),
  track: one(tracks, { fields: [playlistTracks.trackId], references: [tracks.id] }),
}));

/* Tipos derivados */
export type Record = typeof records.$inferSelect;
export type NewRecord = typeof records.$inferInsert;
export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
