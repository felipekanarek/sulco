import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

export type AdminRow = {
  id: number;
  email: string;
  isOwner: boolean;
  allowlisted: boolean;
  createdAt: Date | null;
  discogsUsername: string | null;
  discogsCredentialStatus: 'valid' | 'invalid';
  recordsCount: number;
  lastSyncAt: Date | null;
  lastSyncOutcome:
    | 'running'
    | 'ok'
    | 'erro'
    | 'rate_limited'
    | 'parcial'
    | null;
};

/**
 * Query agregada do painel `/admin` — 1 SELECT retorna tudo que a
 * tabela precisa mostrar. Não é scoped por user; só o owner chama
 * (requireOwner no page.tsx).
 */
export async function listAllUsers(): Promise<AdminRow[]> {
  const rows = await db.all<{
    id: number;
    email: string;
    is_owner: number;
    allowlisted: number;
    created_at: number | null;
    discogs_username: string | null;
    discogs_credential_status: 'valid' | 'invalid';
    records_count: number;
    last_sync_at: number | null;
    last_sync_outcome:
      | 'running'
      | 'ok'
      | 'erro'
      | 'rate_limited'
      | 'parcial'
      | null;
  }>(sql`
    SELECT
      u.id,
      u.email,
      u.is_owner,
      u.allowlisted,
      u.created_at,
      u.discogs_username,
      u.discogs_credential_status,
      (SELECT COUNT(*) FROM records r WHERE r.user_id = u.id) AS records_count,
      (SELECT MAX(s.started_at) FROM sync_runs s WHERE s.user_id = u.id) AS last_sync_at,
      (
        SELECT s.outcome FROM sync_runs s
        WHERE s.user_id = u.id
        ORDER BY s.started_at DESC
        LIMIT 1
      ) AS last_sync_outcome
    FROM users u
    ORDER BY u.created_at ASC
  `);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    isOwner: Boolean(r.is_owner),
    allowlisted: Boolean(r.allowlisted),
    createdAt: r.created_at ? new Date(r.created_at * 1000) : null,
    discogsUsername: r.discogs_username,
    discogsCredentialStatus: r.discogs_credential_status,
    recordsCount: Number(r.records_count ?? 0),
    lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at * 1000) : null,
    lastSyncOutcome: r.last_sync_outcome,
  }));
}
