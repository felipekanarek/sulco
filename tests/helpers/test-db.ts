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
  const stmts = [
    // users
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      discogs_username TEXT,
      discogs_token_encrypted TEXT,
      discogs_credential_status TEXT DEFAULT 'valid' NOT NULL,
      last_status_visit_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE UNIQUE INDEX users_clerk_user_id_unique ON users (clerk_user_id)`,

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
      archived INTEGER DEFAULT 0 NOT NULL,
      archived_at INTEGER,
      archived_acknowledged_at INTEGER,
      imported_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE UNIQUE INDEX records_user_discogs_unique ON records (user_id, discogs_id)`,
    `CREATE INDEX records_user_status_idx ON records (user_id, status)`,
    `CREATE INDEX records_user_archived_idx ON records (user_id, archived)`,

    // tracks
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
      is_bomb INTEGER DEFAULT 0 NOT NULL,
      conflict INTEGER DEFAULT 0 NOT NULL,
      conflict_detected_at INTEGER,
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE UNIQUE INDEX tracks_record_position_unique ON tracks (record_id, position)`,
    `CREATE INDEX tracks_record_selected_idx ON tracks (record_id, selected)`,

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

    // playlists (legacy)
    `CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE TABLE playlist_tracks (
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      "order" INTEGER DEFAULT 0 NOT NULL,
      PRIMARY KEY (playlist_id, track_id)
    )`,
  ];
  for (const stmt of stmts) await client.execute(stmt);
}
