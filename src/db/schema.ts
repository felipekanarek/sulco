import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

/* ============================================================
   USER — conta autenticada (ancorada na Clerk)
   ============================================================ */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clerkUserId: text('clerk_user_id').notNull(),
    email: text('email').notNull(),
    discogsUsername: text('discogs_username'),
    discogsTokenEncrypted: text('discogs_token_encrypted'),
    discogsCredentialStatus: text('discogs_credential_status', { enum: ['valid', 'invalid'] })
      .notNull()
      .default('valid'),
    lastStatusVisitAt: integer('last_status_visit_at', { mode: 'timestamp' }),
    // 010 (Bug 13): timestamp do último reconhecimento do banner de import
    // na home. NULL = nunca reconheceu. Banner só aparece em estado terminal
    // se este timestamp < startedAt do último syncRun kind='initial_import'.
    importAcknowledgedAt: integer('import_acknowledged_at', { mode: 'timestamp' }),
    // 012 (Inc 14, BYOK): config de IA do DJ. Atomicidade garantida
    // (3 nulas = sem config OU 3 preenchidas = config ativa).
    aiProvider: text('ai_provider', {
      enum: ['gemini', 'anthropic', 'openai', 'deepseek', 'qwen'],
    }),
    aiModel: text('ai_model'),
    aiApiKeyEncrypted: text('ai_api_key_encrypted'),
    // 002-multi-conta: travas de autorização (FR-012, FR-001..003)
    isOwner: integer('is_owner', { mode: 'boolean' }).notNull().default(false),
    allowlisted: integer('allowlisted', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    clerkUserIdUnique: uniqueIndex('users_clerk_user_id_unique').on(t.clerkUserId),
  }),
);

/* ============================================================
   INVITES — allowlist interna (FR-001, 002-multi-conta)
   Pivot 2026-04-23: Clerk Allowlist é feature Pro; mantemos aqui.
   ============================================================ */
export const invites = sqliteTable(
  'invites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    addedByUserId: integer('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    // LOWER(email) é aplicado na lógica de app; o índice UNIQUE em email
    // cru protege contra duplicatas exatas.
    emailUnique: uniqueIndex('invites_email_unique').on(t.email),
  }),
);

/* ============================================================
   DISCO — espelho do Discogs + campos autorais de DJ
   ============================================================ */
export const records = sqliteTable(
  'records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // espelho Discogs
    discogsId: integer('discogs_id').notNull(),
    artist: text('artist').notNull(),
    title: text('title').notNull(),
    year: integer('year'),
    label: text('label'),
    country: text('country'),
    format: text('format'),
    coverUrl: text('cover_url'),
    genres: text('genres', { mode: 'json' }).$type<string[]>().default([]),
    styles: text('styles', { mode: 'json' }).$type<string[]>().default([]),
    // campos autorais (AUTHOR — Princípio I da Constituição)
    status: text('status', { enum: ['unrated', 'active', 'discarded'] })
      .notNull()
      .default('unrated'),
    shelfLocation: text('shelf_location'),
    notes: text('notes'),
    // campos SYS (arquivamento — FR-036/FR-041)
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    archivedAcknowledgedAt: integer('archived_acknowledged_at', { mode: 'timestamp' }),
    // Inc 32 (027): versão pre-normalizada (lowercase + sem diacríticos)
    // de `artist + ' ' + title + ' ' + (label ?? '')`. Permite paginação
    // SQL com text filter via LIKE em vez de pós-filtro JS.
    searchText: text('search_text').notNull().default(''),
    importedAt: integer('imported_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    userDiscogsUnique: uniqueIndex('records_user_discogs_unique').on(t.userId, t.discogsId),
    userStatusIdx: index('records_user_status_idx').on(t.userId, t.status),
    userArchivedIdx: index('records_user_archived_idx').on(t.userId, t.archived),
    // Inc 23 (022): composite cobre `WHERE userId = ? AND archived = ? AND status = ?`
    // do queryCollection (filtro combinado mais comum).
    userArchivedStatusIdx: index('records_user_archived_status_idx').on(
      t.userId,
      t.archived,
      t.status,
    ),
    // Inc 32 (027): cobre `WHERE userId = ? AND search_text LIKE ?`.
    // user_id reduz scan; LIKE com %prefix% não usa index pra prefix-match
    // mas full-scan dentro do user (~2588 records) é trivial.
    userSearchTextIdx: index('records_user_search_text_idx').on(t.userId, t.searchText),
    // Inc 35 (030): elimina TEMP B-TREE sort em listagem default da home
    // (`ORDER BY imported_at DESC`). DESC explícito.
    userArchivedImportedIdx: index('records_user_archived_imported_idx').on(
      t.userId,
      t.archived,
      sql`${t.importedAt} DESC`,
    ),
    // Inc 35 (030): elimina TEMP B-TREE sort em listagem de archived em /status
    // (`ORDER BY archived_at DESC`).
    userArchivedArchivedatIdx: index('records_user_archived_archivedat_idx').on(
      t.userId,
      t.archived,
      sql`${t.archivedAt} DESC`,
    ),
  }),
);

/* ============================================================
   FAIXA — tracklist do Discogs + curadoria do DJ
   ============================================================ */
export const tracks = sqliteTable(
  'tracks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recordId: integer('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    // espelho Discogs
    position: text('position').notNull(),
    title: text('title').notNull(),
    duration: text('duration'),
    // curadoria (AUTHOR)
    selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
    bpm: integer('bpm'),
    musicalKey: text('musical_key'), // notação Camelot `1A`–`12A` / `1B`–`12B` (FR-017b)
    energy: integer('energy'), // 1..5
    rating: integer('rating'), // 1..3 (+/++/+++ — FR-020c)
    moods: text('moods', { mode: 'json' }).$type<string[]>().default([]),
    contexts: text('contexts', { mode: 'json' }).$type<string[]>().default([]),
    fineGenre: text('fine_genre'),
    references: text('references'),
    comment: text('comment'),
    // 013 (Inc 13): análise gerada via IA. AUTHOR híbrido — IA escreve
    // via clique do DJ (intencional); DJ pode editar como `comment`.
    // Nunca escrita por sync de fonte externa.
    aiAnalysis: text('ai_analysis'),
    isBomb: integer('is_bomb', { mode: 'boolean' }).notNull().default(false),
    // 005-acousticbrainz-audio-features
    mbid: text('mbid'),
    audioFeaturesSource: text('audio_features_source', {
      enum: ['acousticbrainz', 'manual'],
    }),
    audioFeaturesSyncedAt: integer('audio_features_synced_at', { mode: 'timestamp' }),
    // 008 — preview de áudio (zona SYS)
    previewUrl: text('preview_url'),
    previewUrlCachedAt: integer('preview_url_cached_at', { mode: 'timestamp' }),
    // SYS (conflito — FR-037)
    conflict: integer('conflict', { mode: 'boolean' }).notNull().default(false),
    conflictDetectedAt: integer('conflict_detected_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    recordPositionUnique: uniqueIndex('tracks_record_position_unique').on(t.recordId, t.position),
    recordSelectedIdx: index('tracks_record_selected_idx').on(t.recordId, t.selected),
    audioFeaturesBacklogIdx: index('tracks_af_backlog_idx').on(
      t.audioFeaturesSource,
      t.audioFeaturesSyncedAt,
    ),
    // Inc 23 (022): cobre lookup de bombs em queryCollection
    // (`WHERE recordId IN (...) AND isBomb = true`).
    recordIsBombIdx: index('tracks_record_is_bomb_idx').on(t.recordId, t.isBomb),
  }),
);

/* ============================================================
   SET — evento específico com briefing
   (status NÃO é persistido — derivado de eventDate via deriveSetStatus)
   ============================================================ */
export const sets = sqliteTable('sets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  eventDate: integer('event_date', { mode: 'timestamp' }),
  location: text('location'),
  briefing: text('briefing'),
  montarFiltersJson: text('montar_filters_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

/* tabela de junção: faixas de um set, com ordem */
export const setTracks = sqliteTable(
  'set_tracks',
  {
    setId: integer('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.setId, t.trackId] }),
    setOrderIdx: index('set_tracks_set_order_idx').on(t.setId, t.order),
  }),
);

/* ============================================================
   SYNC RUNS — registro de cada execução de sync/reimport (FR-039/FR-040)
   ============================================================ */
export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['initial_import', 'daily_auto', 'manual', 'reimport_record'],
    }).notNull(),
    targetRecordId: integer('target_record_id').references(() => records.id, {
      onDelete: 'set null',
    }),
    startedAt: integer('started_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    outcome: text('outcome', {
      enum: ['running', 'ok', 'erro', 'rate_limited', 'parcial'],
    })
      .notNull()
      .default('running'),
    newCount: integer('new_count').notNull().default(0),
    removedCount: integer('removed_count').notNull().default(0),
    conflictCount: integer('conflict_count').notNull().default(0),
    errorMessage: text('error_message'),
    lastCheckpointPage: integer('last_checkpoint_page'),
    snapshotJson: text('snapshot_json'),
  },
  (t) => ({
    userStartedIdx: index('sync_runs_user_started_idx').on(t.userId, t.startedAt),
    userOutcomeIdx: index('sync_runs_user_outcome_idx').on(t.userId, t.outcome),
  }),
);

/* ============================================================
   USER FACETS — denormalização (Inc 24)
   Cache materializado de agregações pesadas. 1 row por user.
   Atualizado por `recomputeFacets(userId)` (síncrono) no fim de
   Server Actions de write críticas.
   ============================================================ */
// Inc 34 (029): contadores denormalizados de records/tracks por user.
// Vocabulário (genres/styles/moods/contexts/shelves) vive em `user_vocab`
// (Inc 33) — colunas JSON antigas em user_facets foram dropadas.
export const userFacets = sqliteTable('user_facets', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  recordsTotal: integer('records_total').notNull().default(0),
  recordsActive: integer('records_active').notNull().default(0),
  recordsUnrated: integer('records_unrated').notNull().default(0),
  recordsDiscarded: integer('records_discarded').notNull().default(0),
  tracksSelectedTotal: integer('tracks_selected_total').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/* ============================================================
   USER_VOCAB — vocabulário materializado por user × kind × term (Inc 33)
   Substitui as 5 colunas JSON em user_facets por counters incrementais.
   Cada entry representa um termo em uso (ref_count > 0); decrement
   leva a 0 → DELETE no cleanup. PK composta evita duplicação.
   ============================================================ */
export const userVocab = sqliteTable(
  'user_vocab',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Inc 33 (5 kinds originais) + Inc 8 (3 kinds novos: formats/countries/labels).
    // CHECK constraint REMOVIDO em prod via recriação da tabela (Inc 8 — Q4=C).
    // Validação migra pra TS via Drizzle enum.
    kind: text('kind', {
      enum: ['genres', 'styles', 'moods', 'contexts', 'shelves', 'formats', 'countries', 'labels'],
    }).notNull(),
    term: text('term').notNull(),
    refCount: integer('ref_count').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.kind, t.term] }),
    userKindIdx: index('user_vocab_user_kind_idx').on(t.userId, t.kind),
  }),
);

export type UserVocabRow = typeof userVocab.$inferSelect;
export type NewUserVocabRow = typeof userVocab.$inferInsert;

/* ============================================================
   PIVOTS de filtros multi-select (Inc 35 / 030)
   Substituem `EXISTS json_each(...)` por `IN (subquery WHERE value IN ?)`
   contra index direto. PK composta `(fk_id, value)` + index reverso
   `(value, fk_id)` cobre ambos lados. ON DELETE CASCADE garante limpeza
   automática quando record/track é fisicamente deletado (raríssimo).
   Archive não toca pivot — filtros base já têm `WHERE archived=0`.
   ============================================================ */

export const recordGenres = sqliteTable(
  'record_genres',
  {
    recordId: integer('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    genre: text('genre').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recordId, t.genre] }),
    genreIdx: index('record_genres_genre_idx').on(t.genre, t.recordId),
  }),
);

export const recordStyles = sqliteTable(
  'record_styles',
  {
    recordId: integer('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    style: text('style').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recordId, t.style] }),
    styleIdx: index('record_styles_style_idx').on(t.style, t.recordId),
  }),
);

export const trackMoods = sqliteTable(
  'track_moods',
  {
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    mood: text('mood').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.mood] }),
    moodIdx: index('track_moods_mood_idx').on(t.mood, t.trackId),
  }),
);

export const trackContexts = sqliteTable(
  'track_contexts',
  {
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    context: text('context').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.context] }),
    contextIdx: index('track_contexts_context_idx').on(t.context, t.trackId),
  }),
);

/* ============================================================
   PLAYLIST — bloco reutilizável de faixas
   (FR-053a: NUNCA aparece na UI do piloto; tabelas mantidas para evitar
   migration destrutiva, mas não são lidas nem escritas)
   ============================================================ */
export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // 002-multi-conta: fecha dívida do audit (FR-008). Mesmo que rotas
  // /playlists* sigam 404, garante isolamento caso sejam reativadas.
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const playlistTracks = sqliteTable(
  'playlist_tracks',
  {
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    // 002-multi-conta: redundante com playlists.userId mas reforça
    // isolamento a nível de constraint (PT1 invariante em data-model).
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.playlistId, t.trackId] }) }),
);

/* ============================================================
   Relações (para joins com o query builder relacional)
   ============================================================ */
export const usersRelations = relations(users, ({ many }) => ({
  records: many(records),
  sets: many(sets),
  syncRuns: many(syncRuns),
  playlists: many(playlists),
  invitesAdded: many(invites),
}));

export const recordsRelations = relations(records, ({ one, many }) => ({
  user: one(users, { fields: [records.userId], references: [users.id] }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  record: one(records, { fields: [tracks.recordId], references: [records.id] }),
  setTracks: many(setTracks),
  playlistTracks: many(playlistTracks),
}));

export const setsRelations = relations(sets, ({ one, many }) => ({
  user: one(users, { fields: [sets.userId], references: [users.id] }),
  setTracks: many(setTracks),
}));

export const setTracksRelations = relations(setTracks, ({ one }) => ({
  set: one(sets, { fields: [setTracks.setId], references: [sets.id] }),
  track: one(tracks, { fields: [setTracks.trackId], references: [tracks.id] }),
}));

export const syncRunsRelations = relations(syncRuns, ({ one }) => ({
  user: one(users, { fields: [syncRuns.userId], references: [users.id] }),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(users, { fields: [playlists.userId], references: [users.id] }),
  playlistTracks: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, { fields: [playlistTracks.trackId], references: [tracks.id] }),
  user: one(users, { fields: [playlistTracks.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  addedBy: one(users, {
    fields: [invites.addedByUserId],
    references: [users.id],
  }),
}));

/* ============================================================
   Tipos derivados
   ============================================================ */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Record = typeof records.$inferSelect;
export type NewRecord = typeof records.$inferInsert;
export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;
export type SetTrack = typeof setTracks.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
