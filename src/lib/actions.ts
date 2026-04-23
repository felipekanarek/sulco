'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns, users } from '@/db/schema';
import { requireCurrentUser } from '@/lib/auth';
import { encryptPAT } from '@/lib/crypto';
import { markCredentialValid } from '@/lib/discogs';
import {
  DiscogsAuthError,
  DiscogsError,
  fetchCollectionPage,
} from '@/lib/discogs/client';
import { runInitialImport } from '@/lib/discogs/import';

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* ============================================================
   saveDiscogsCredential — FR-004, FR-046, FR-050, FR-051, FR-053
   (T032)
   ============================================================ */

const saveCredentialSchema = z.object({
  discogsUsername: z.string().trim().min(1).max(100),
  discogsPat: z.string().trim().min(10).max(200),
});

export async function saveDiscogsCredential(
  input: z.infer<typeof saveCredentialSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();

  const parsed = saveCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos. Verifique username (1..100) e PAT (>=10 chars).',
    };
  }
  const { discogsUsername, discogsPat } = parsed.data;

  // Persiste o token primeiro (cifrado) para que o cliente Discogs —
  // que usa `getTokenForUser()` — possa ler dentro de `fetchCollectionPage`.
  // FR-053: se houver sync em andamento ele continua com o token antigo
  // já decriptado em memória; salvar aqui NÃO aborta.
  const encryptedToken = encryptPAT(discogsPat);
  await db
    .update(users)
    .set({
      discogsUsername,
      discogsTokenEncrypted: encryptedToken,
      // status fica `valid` enquanto validamos; se falhar revertemos
      discogsCredentialStatus: 'valid',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Validação plena conforme FR-051: o endpoint `/oauth/identity` só garante
  // que o PAT é válido. Para diferenciar `username inexistente` vs `coleção vazia`
  // vs `Discogs fora do ar`, batemos direto na primeira página da coleção.
  try {
    const page = await fetchCollectionPage(user.id, { page: 1, perPage: 1 });
    if (page.pagination.items === 0) {
      await clearCredentialOnFailure(user.id);
      return {
        ok: false,
        error:
          'Esta conta Discogs não tem discos na coleção. Adicione ao menos um disco no Discogs e tente de novo.',
      };
    }
  } catch (err) {
    await clearCredentialOnFailure(user.id);

    if (err instanceof DiscogsAuthError) {
      return {
        ok: false,
        error: 'Token inválido no Discogs, verifique e tente novamente.',
      };
    }
    if (err instanceof DiscogsError) {
      if (err.status === 404) {
        return {
          ok: false,
          error: 'Usuário Discogs não encontrado.',
        };
      }
      if (err.status === 429) {
        return {
          ok: false,
          error:
            'Discogs está limitando a taxa agora, aguarde um minuto e tente novamente.',
        };
      }
      if (err.status >= 500) {
        return {
          ok: false,
          error:
            'Não foi possível falar com o Discogs agora; tente novamente em alguns minutos.',
        };
      }
    }
    return {
      ok: false,
      error:
        'Erro inesperado ao validar credencial. Verifique sua conexão e tente novamente.',
    };
  }

  // Sucesso: credencial válida e coleção não-vazia.
  await markCredentialValid(user.id);

  // Dispara import inicial em background — intencionalmente não `await`.
  // FR-030: o DJ não fica bloqueado esperando; o componente <ImportProgress>
  // faz polling a cada 3s no lado do cliente.
  runInitialImport(user.id).catch((err) => {
    console.error('[sulco] runInitialImport fundo falhou:', err);
  });

  revalidatePath('/onboarding');
  revalidatePath('/conta');
  revalidatePath('/');

  return { ok: true };
}

async function clearCredentialOnFailure(userId: number): Promise<void> {
  await db
    .update(users)
    .set({
      discogsTokenEncrypted: null,
      discogsUsername: null,
      discogsCredentialStatus: 'valid',
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/* ============================================================
   getImportProgress — FR-030 (T039)
   Retorna o estado do último syncRun kind='initial_import' do usuário
   atual, para o componente client de polling 3s.
   ============================================================ */

export type ImportProgress = {
  running: boolean;
  x: number; // discos já importados (count em `records` do user)
  y: number; // total anunciado pela primeira página (do snapshotJson); null se desconhecido
  outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial' | 'idle';
  errorMessage: string | null;
};

export async function getImportProgress(): Promise<ImportProgress> {
  const user = await requireCurrentUser();
  const latest = await db
    .select({
      outcome: syncRuns.outcome,
      snapshotJson: syncRuns.snapshotJson,
      errorMessage: syncRuns.errorMessage,
      newCount: syncRuns.newCount,
    })
    .from(syncRuns)
    .where(and(eq(syncRuns.userId, user.id), eq(syncRuns.kind, 'initial_import')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const [{ count: recordCount = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(records)
    .where(eq(records.userId, user.id));

  const x = Number(recordCount);

  if (latest.length === 0) {
    return {
      running: false,
      x,
      y: x, // não conhecido; exibe apenas X
      outcome: 'idle',
      errorMessage: null,
    };
  }

  const row = latest[0];
  let y = x;
  if (row.snapshotJson) {
    try {
      const parsed = JSON.parse(row.snapshotJson) as { totalItems?: number };
      if (typeof parsed.totalItems === 'number') y = parsed.totalItems;
    } catch {
      // ignora snapshot corrompido
    }
  }

  return {
    running: row.outcome === 'running',
    x,
    y,
    outcome: row.outcome,
    errorMessage: row.errorMessage,
  };
}

/* ============================================================
   updateRecordStatus — FR-011/FR-012 (T052)
   Muda o status de um disco do DJ e revalida rotas dependentes.
   ============================================================ */

const statusSchema = z.object({
  recordId: z.number().int().positive(),
  status: z.enum(['unrated', 'active', 'discarded']),
});

export async function updateRecordStatus(input: {
  recordId: number;
  status: 'unrated' | 'active' | 'discarded';
}): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Status inválido.' };
  }

  const updated = await db
    .update(records)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(records.id, parsed.data.recordId), eq(records.userId, user.id)))
    .returning({ id: records.id });

  if (updated.length === 0) {
    return { ok: false, error: 'Disco não encontrado.' };
  }

  revalidatePath('/');
  revalidatePath('/curadoria');
  revalidatePath(`/disco/${parsed.data.recordId}`);
  return { ok: true };
}

/* ============================================================
   updateTrackCuration — FR-016..FR-020c (T059)
   Atualização parcial da curadoria de uma faixa.
   ============================================================ */

import { tracks as tracksTable } from '@/db/schema';
import { normalizeVocabTerm, buildSuggestionList, DEFAULT_MOOD_SEEDS, DEFAULT_CONTEXT_SEEDS } from '@/lib/vocabulary';

const CAMELOT_REGEX = /^(?:[1-9]|1[0-2])[AB]$/;

const trackCurationSchema = z
  .object({
    trackId: z.number().int().positive(),
    recordId: z.number().int().positive(),
    selected: z.boolean().optional(),
    bpm: z.number().int().min(0).max(250).nullable().optional(), // FR-017c
    musicalKey: z
      .string()
      .regex(CAMELOT_REGEX, 'Use notação Camelot (ex: 8A, 11B)')
      .nullable()
      .optional(), // FR-017b
    energy: z.number().int().min(1).max(5).nullable().optional(),
    rating: z.number().int().min(1).max(3).nullable().optional(), // FR-020c
    moods: z.array(z.string().min(1).max(40)).max(20).optional(),
    contexts: z.array(z.string().min(1).max(40)).max(20).optional(),
    fineGenre: z.string().max(5000).nullable().optional(), // FR-017d
    references: z.string().max(5000).nullable().optional(),
    comment: z.string().max(5000).nullable().optional(),
    isBomb: z.boolean().optional(), // FR-018
  })
  .passthrough();

export async function updateTrackCuration(
  input: z.infer<typeof trackCurationSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = trackCurationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  // Ownership check: confirmar que a track pertence a um record do user
  const own = await db
    .select({ id: tracksTable.id })
    .from(tracksTable)
    .innerJoin(records, eq(tracksTable.recordId, records.id))
    .where(and(eq(tracksTable.id, parsed.data.trackId), eq(records.userId, user.id)))
    .limit(1);
  if (own.length === 0) {
    return { ok: false, error: 'Faixa não encontrada.' };
  }

  const payload: Partial<typeof tracksTable.$inferInsert> & {
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.data.selected !== undefined) payload.selected = parsed.data.selected;
  if (parsed.data.bpm !== undefined) payload.bpm = parsed.data.bpm;
  if (parsed.data.musicalKey !== undefined) payload.musicalKey = parsed.data.musicalKey;
  if (parsed.data.energy !== undefined) payload.energy = parsed.data.energy;
  if (parsed.data.rating !== undefined) payload.rating = parsed.data.rating;
  if (parsed.data.fineGenre !== undefined) payload.fineGenre = parsed.data.fineGenre;
  if (parsed.data.references !== undefined) payload.references = parsed.data.references;
  if (parsed.data.comment !== undefined) payload.comment = parsed.data.comment;
  if (parsed.data.isBomb !== undefined) payload.isBomb = parsed.data.isBomb;

  // FR-017a: normalização trim + lowercase + dedup
  if (parsed.data.moods !== undefined) {
    const seen = new Set<string>();
    payload.moods = parsed.data.moods
      .map(normalizeVocabTerm)
      .filter((m) => m.length > 0 && !seen.has(m) && seen.add(m));
  }
  if (parsed.data.contexts !== undefined) {
    const seen = new Set<string>();
    payload.contexts = parsed.data.contexts
      .map(normalizeVocabTerm)
      .filter((c) => c.length > 0 && !seen.has(c) && seen.add(c));
  }

  await db
    .update(tracksTable)
    .set(payload)
    .where(eq(tracksTable.id, parsed.data.trackId));

  revalidatePath(`/disco/${parsed.data.recordId}`);
  revalidatePath('/curadoria');
  revalidatePath('/');
  return { ok: true };
}

/* ============================================================
   listUserVocabulary — FR-017a (T062)
   Retorna termos ordenados (uso do DJ por frequência + sementes alfa).
   ============================================================ */

export async function listUserVocabulary(
  kind: 'moods' | 'contexts',
): Promise<string[]> {
  const user = await requireCurrentUser();
  const column = kind === 'moods' ? tracksTable.moods : tracksTable.contexts;
  // Agrega todos os termos usados pelo DJ com contagem
  const rows = await db
    .select({
      term: sql<string>`value`,
      count: sql<number>`COUNT(*)`,
    })
    .from(tracksTable)
    .innerJoin(records, eq(tracksTable.recordId, records.id))
    .innerJoin(sql`json_each(${column})`, sql`1=1`)
    .where(eq(records.userId, user.id))
    .groupBy(sql`value`);

  const userTerms = rows.map((r) => ({ term: r.term, count: Number(r.count) }));
  const seeds = kind === 'moods' ? DEFAULT_MOOD_SEEDS : DEFAULT_CONTEXT_SEEDS;
  return buildSuggestionList(userTerms, seeds);
}

/* ============================================================
   updateRecordAuthorFields — FR-005, FR-011, FR-020b (T064)
   ============================================================ */

const recordFieldsSchema = z.object({
  recordId: z.number().int().positive(),
  shelfLocation: z.string().max(50).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function updateRecordAuthorFields(
  input: z.infer<typeof recordFieldsSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = recordFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const payload: Partial<typeof records.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (parsed.data.shelfLocation !== undefined) payload.shelfLocation = parsed.data.shelfLocation;
  if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes;

  const updated = await db
    .update(records)
    .set(payload)
    .where(and(eq(records.id, parsed.data.recordId), eq(records.userId, user.id)))
    .returning({ id: records.id });

  if (updated.length === 0) {
    return { ok: false, error: 'Disco não encontrado.' };
  }

  revalidatePath(`/disco/${parsed.data.recordId}`);
  revalidatePath('/curadoria');
  revalidatePath('/');
  return { ok: true };
}

// Placeholders serão substituídos conforme as tasks:
// T059 updateTrackCuration
// T062 listUserVocabulary
// T064 updateRecordAuthorFields
// T070 createSet / updateSet
// T073 saveMontarFilters
// T076 addTrackToSet / removeTrackFromSet
// T079 reorderSetTracks
// T090 triggerManualSync / reimportRecord
// T099 resolveTrackConflict
// T101 acknowledgeArchivedRecord
// T109 deleteAccount
