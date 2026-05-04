import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/db/schema';

/**
 * Cria um DB SQLite in-memory com o schema espelhado do
 * `src/db/schema.ts`. Usado por tests de integração que precisam de
 * isolamento total do DB de dev/prod.
 */
export async function createTestDb() {
  const client: Client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await applyDdl(client);
  return { db, client };
}

async function applyDdl(client: Client) {
  // Habilita FK enforcement — libsql/sqlite default é OFF.
  await client.execute('PRAGMA foreign_keys = ON');
  const stmts = [
    // users (002-multi-conta: is_owner + allowlisted)
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      discogs_username TEXT,
      discogs_token_encrypted TEXT,
      discogs_credential_status TEXT DEFAULT 'valid' NOT NULL,
      last_status_visit_at INTEGER,
      import_acknowledged_at INTEGER,
      ai_provider TEXT,
      ai_model TEXT,
      ai_api_key_encrypted TEXT,
      is_owner INTEGER DEFAULT 0 NOT NULL,
      allowlisted INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE UNIQUE INDEX users_clerk_user_id_unique ON users (clerk_user_id)`,

    // invites (002-multi-conta: allowlist interna)
    `CREATE TABLE invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )`,
    `CREATE UNIQUE INDEX invites_email_unique ON invites (email)`,

    // records
    `CREATE TABLE records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      discogs_id INTEGER NOT NULL,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      label TEXT,
      country TEXT,
      format TEXT,
      cover_url TEXT,
      genres TEXT DEFAULT '[]',
      styles TEXT DEFAULT '[]',
      status TEXT DEFAULT 'unrated' NOT NULL,
      shelf_location TEXT,
      notes TEXT,
      search_text TEXT DEFAULT '' NOT NULL,
      archived INTEGER DEFAULT 0 NOT NULL,
      archived_at INTEGER,
      archived_acknowledged_at INTEGER,
      imported_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE UNIQUE INDEX records_user_discogs_unique ON records (user_id, discogs_id)`,
    `CREATE INDEX records_user_status_idx ON records (user_id, status)`,
    `CREATE INDEX records_user_archived_idx ON records (user_id, archived)`,

    // tracks (005: mbid, audio_features_source, audio_features_synced_at)
    `CREATE TABLE tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      position TEXT NOT NULL,
      title TEXT NOT NULL,
      duration TEXT,
      selected INTEGER DEFAULT 0 NOT NULL,
      bpm INTEGER,
      musical_key TEXT,
      energy INTEGER,
      rating INTEGER,
      moods TEXT DEFAULT '[]',
      contexts TEXT DEFAULT '[]',
      fine_genre TEXT,
      "references" TEXT,
      comment TEXT,
      ai_analysis TEXT,
      is_bomb INTEGER DEFAULT 0 NOT NULL,
      mbid TEXT,
      audio_features_source TEXT,
      audio_features_synced_at INTEGER,
      preview_url TEXT,
      preview_url_cached_at INTEGER,
      conflict INTEGER DEFAULT 0 NOT NULL,
      conflict_detected_at INTEGER,
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE UNIQUE INDEX tracks_record_position_unique ON tracks (record_id, position)`,
    `CREATE INDEX tracks_record_selected_idx ON tracks (record_id, selected)`,
    `CREATE INDEX tracks_af_backlog_idx ON tracks (audio_features_source, audio_features_synced_at)`,

    // sets
    `CREATE TABLE sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      event_date INTEGER,
      location TEXT,
      briefing TEXT,
      montar_filters_json TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`,

    // set_tracks
    `CREATE TABLE set_tracks (
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      "order" INTEGER DEFAULT 0 NOT NULL,
      PRIMARY KEY (set_id, track_id)
    )`,
    `CREATE INDEX set_tracks_set_order_idx ON set_tracks (set_id, "order")`,

    // sync_runs
    `CREATE TABLE sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      target_record_id INTEGER REFERENCES records(id) ON DELETE SET NULL,
      started_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      finished_at INTEGER,
      outcome TEXT DEFAULT 'running' NOT NULL,
      new_count INTEGER DEFAULT 0 NOT NULL,
      removed_count INTEGER DEFAULT 0 NOT NULL,
      conflict_count INTEGER DEFAULT 0 NOT NULL,
      error_message TEXT,
      last_checkpoint_page INTEGER,
      snapshot_json TEXT
    )`,
    `CREATE INDEX sync_runs_user_started_idx ON sync_runs (user_id, started_at)`,
    `CREATE INDEX sync_runs_user_outcome_idx ON sync_runs (user_id, outcome)`,

    // playlists (002: ganhou user_id NOT NULL CASCADE)
    `CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE TABLE playlist_tracks (
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "order" INTEGER DEFAULT 0 NOT NULL,
      PRIMARY KEY (playlist_id, track_id)
    )`,

    // Inc 35 (030) — pivots pra filtros multi-select
    `CREATE TABLE record_genres (
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      genre TEXT NOT NULL,
      PRIMARY KEY (record_id, genre)
    )`,
    `CREATE INDEX record_genres_genre_idx ON record_genres (genre, record_id)`,
    `CREATE TABLE record_styles (
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      style TEXT NOT NULL,
      PRIMARY KEY (record_id, style)
    )`,
    `CREATE INDEX record_styles_style_idx ON record_styles (style, record_id)`,
    `CREATE TABLE track_moods (
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      mood TEXT NOT NULL,
      PRIMARY KEY (track_id, mood)
    )`,
    `CREATE INDEX track_moods_mood_idx ON track_moods (mood, track_id)`,
    `CREATE TABLE track_contexts (
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      context TEXT NOT NULL,
      PRIMARY KEY (track_id, context)
    )`,
    `CREATE INDEX track_contexts_context_idx ON track_contexts (context, track_id)`,

    // Inc 36 (033) — pivot record_formats
    `CREATE TABLE record_formats (
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      PRIMARY KEY (record_id, token)
    )`,
    `CREATE INDEX record_formats_token_idx ON record_formats (token, record_id)`,

    // Inc 33 (028) — user_vocab + Inc 23 (022) user_facets (dependências
    // dos hooks de write em apply-update.ts)
    `CREATE TABLE user_vocab (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      term TEXT NOT NULL,
      ref_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, kind, term)
    )`,
    `CREATE INDEX user_vocab_user_kind_idx ON user_vocab (user_id, kind)`,
    `CREATE TABLE user_facets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      records_total INTEGER NOT NULL DEFAULT 0,
      records_active INTEGER NOT NULL DEFAULT 0,
      records_unrated INTEGER NOT NULL DEFAULT 0,
      records_discarded INTEGER NOT NULL DEFAULT 0,
      tracks_selected_total INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ];
  for (const stmt of stmts) await client.execute(stmt);
}
