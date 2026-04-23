'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
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

  // Só dispara novo import se NÃO houver um em andamento. Evita race de
  // duplo-clique no form criando múltiplos imports em paralelo que colidem
  // em INSERTs concorrentes.
  const alreadyRunning = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, user.id),
        eq(syncRuns.kind, 'initial_import'),
        eq(syncRuns.outcome, 'running'),
      ),
    )
    .limit(1);

  if (alreadyRunning.length === 0) {
    // Dispara import inicial em background — em serverless (Vercel), `after()`
    // mantém o worker vivo após a response ser retornada (até ~5min em Hobby).
    // FR-030: o DJ não fica bloqueado esperando; o componente <ImportProgress>
    // faz polling a cada 3s no lado do cliente.
    after(async () => {
      try {
        await runInitialImport(user.id);
      } catch (err) {
        console.error('[sulco] runInitialImport fundo falhou:', err);
      }
    });
  }

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

  // Runs zumbis (processo morreu sem finalizar) não devem aparecer como
  // "erro" visível ao DJ — esse é um estado transiente que o fallback em
  // `/` retoma. Trata como `idle` para o ImportProgressCard se comportar
  // como "nenhum import visível" e permitir o fallback disparar novo run.
  const isZombieResidual =
    (row.outcome === 'erro' || row.outcome === 'parcial') &&
    typeof row.errorMessage === 'string' &&
    /(run zumbi|killed on restart)/i.test(row.errorMessage);

  if (isZombieResidual) {
    return { running: false, x, y: x, outcome: 'idle', errorMessage: null };
  }

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

/* ============================================================
   createSet / updateSet — FR-022, FR-027, FR-028 (T070)
   eventDate armazenado em UTC; conversão vem do input datetime-local
   do cliente (que já envia ISO UTC via new Date().toISOString()).
   ============================================================ */

import { sets as setsTable } from '@/db/schema';

const eventDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().length(0))
  .nullable()
  .optional();

const createSetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  eventDate: eventDateSchema,
  location: z.string().max(200).trim().nullable().optional(),
  briefing: z.string().max(5000).trim().nullable().optional(),
});

export async function createSet(
  input: z.infer<typeof createSetSchema>,
): Promise<ActionResult<{ setId: number }>> {
  const user = await requireCurrentUser();
  const parsed = createSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const eventDate = normalizeDate(parsed.data.eventDate);
  const inserted = await db
    .insert(setsTable)
    .values({
      userId: user.id,
      name: parsed.data.name,
      eventDate,
      location: parsed.data.location?.trim() || null,
      briefing: parsed.data.briefing?.trim() || null,
    })
    .returning({ id: setsTable.id });

  revalidatePath('/sets');
  return { ok: true, data: { setId: inserted[0].id } };
}

const updateSetSchema = z.object({
  setId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  eventDate: eventDateSchema,
  location: z.string().max(200).trim().nullable().optional(),
  briefing: z.string().max(5000).trim().nullable().optional(),
});

export async function updateSet(
  input: z.infer<typeof updateSetSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = updateSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const payload: Partial<typeof setsTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) payload.name = parsed.data.name;
  if (parsed.data.eventDate !== undefined) payload.eventDate = normalizeDate(parsed.data.eventDate);
  if (parsed.data.location !== undefined) payload.location = parsed.data.location?.trim() || null;
  if (parsed.data.briefing !== undefined) payload.briefing = parsed.data.briefing?.trim() || null;

  const updated = await db
    .update(setsTable)
    .set(payload)
    .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
    .returning({ id: setsTable.id });

  if (updated.length === 0) {
    return { ok: false, error: 'Set não encontrado.' };
  }
  revalidatePath('/sets');
  revalidatePath(`/sets/${parsed.data.setId}`);
  revalidatePath(`/sets/${parsed.data.setId}/montar`);
  return { ok: true };
}

function normalizeDate(value: string | null | undefined): Date | null {
  if (!value || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ============================================================
   saveMontarFilters — FR-024a (T073)
   Persiste o estado dos filtros por set em `sets.montarFiltersJson`.
   ============================================================ */

import { setTracks as setTracksTable } from '@/db/schema';

const montarFiltersSchema = z.object({
  setId: z.number().int().positive(),
  filters: z.object({
    bpm: z
      .object({
        min: z.number().int().min(0).max(250).optional(),
        max: z.number().int().min(0).max(250).optional(),
      })
      .optional(),
    musicalKey: z
      .array(z.string().regex(/^(?:[1-9]|1[0-2])[AB]$/))
      .optional(),
    energy: z
      .object({
        min: z.number().int().min(1).max(5).optional(),
        max: z.number().int().min(1).max(5).optional(),
      })
      .optional(),
    rating: z
      .object({
        min: z.number().int().min(1).max(3).optional(),
        max: z.number().int().min(1).max(3).optional(),
      })
      .optional(),
    moods: z.array(z.string()).optional(),
    contexts: z.array(z.string()).optional(),
    bomba: z.enum(['any', 'only', 'none']).optional(),
    text: z.string().max(200).optional(),
  }),
});

export async function saveMontarFilters(
  input: z.infer<typeof montarFiltersSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = montarFiltersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const updated = await db
    .update(setsTable)
    .set({
      montarFiltersJson: JSON.stringify(parsed.data.filters),
      updatedAt: new Date(),
    })
    .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
    .returning({ id: setsTable.id });

  if (updated.length === 0) return { ok: false, error: 'Set não encontrado.' };
  // Sem revalidatePath aqui: a UI usa client state + router.replace com searchParams.
  return { ok: true };
}

/* ============================================================
   addTrackToSet / removeTrackFromSet — FR-025, FR-029, FR-029a (T076)
   ============================================================ */

const setTrackSchema = z.object({
  setId: z.number().int().positive(),
  trackId: z.number().int().positive(),
});

export async function addTrackToSet(
  input: z.infer<typeof setTrackSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = setTrackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input inválido.' };

  // Ownership check: set pertence ao user; track pertence a record do user.
  const ownership = await db
    .select({ setId: setsTable.id })
    .from(setsTable)
    .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
    .limit(1);
  if (ownership.length === 0) return { ok: false, error: 'Set não encontrado.' };

  const trackOk = await db
    .select({ id: tracksTable.id })
    .from(tracksTable)
    .innerJoin(records, eq(tracksTable.recordId, records.id))
    .where(and(eq(tracksTable.id, parsed.data.trackId), eq(records.userId, user.id)))
    .limit(1);
  if (trackOk.length === 0) return { ok: false, error: 'Faixa não encontrada.' };

  // FR-029a: verifica limite 300
  const countRows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(setTracksTable)
    .where(eq(setTracksTable.setId, parsed.data.setId));
  const currentCount = Number(countRows[0]?.c ?? 0);
  if (currentCount >= 300) {
    return { ok: false, error: 'Limite de 300 faixas por set atingido.' };
  }

  // Próximo order
  const maxOrderRows = await db
    .select({ m: sql<number>`COALESCE(MAX(${setTracksTable.order}), -1)` })
    .from(setTracksTable)
    .where(eq(setTracksTable.setId, parsed.data.setId));
  const nextOrder = Number(maxOrderRows[0]?.m ?? -1) + 1;

  await db
    .insert(setTracksTable)
    .values({ setId: parsed.data.setId, trackId: parsed.data.trackId, order: nextOrder })
    .onConflictDoNothing({
      target: [setTracksTable.setId, setTracksTable.trackId],
    });

  revalidatePath(`/sets/${parsed.data.setId}`);
  revalidatePath(`/sets/${parsed.data.setId}/montar`);
  return { ok: true };
}

// (add: revalidatePath da rota montar é necessário para que PhysicalBag/
// SetSidePanel RSC recalculem contagem e bag ao vivo quando o DJ clica +
// num candidato. O bug de "Cannot update Router while rendering" acontecia
// apenas no reorder onde o handler estava dentro de um startTransition mal
// posicionado; add/remove normais não sofrem disso.)

export async function removeTrackFromSet(
  input: z.infer<typeof setTrackSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = setTrackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input inválido.' };

  // Ownership (só deleta se o set pertence ao user)
  const ownership = await db
    .select({ setId: setsTable.id })
    .from(setsTable)
    .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
    .limit(1);
  if (ownership.length === 0) return { ok: false, error: 'Set não encontrado.' };

  // FR-029: NEVER toca selected/isBomb da track original. Apenas deleta a junção.
  await db
    .delete(setTracksTable)
    .where(
      and(
        eq(setTracksTable.setId, parsed.data.setId),
        eq(setTracksTable.trackId, parsed.data.trackId),
      ),
    );

  revalidatePath(`/sets/${parsed.data.setId}`);
  revalidatePath(`/sets/${parsed.data.setId}/montar`);
  return { ok: true };
}

/* ============================================================
   reorderSetTracks — FR-026 (T079)
   Grava a nova ordem das faixas do set. trackIds devem ser exatamente
   as faixas atualmente no set (caller garante).
   ============================================================ */

const reorderSchema = z.object({
  setId: z.number().int().positive(),
  trackIds: z.array(z.number().int().positive()).min(1).max(300),
});

export async function reorderSetTracks(
  input: z.infer<typeof reorderSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input inválido.' };

  // Ownership
  const ownership = await db
    .select({ id: setsTable.id })
    .from(setsTable)
    .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
    .limit(1);
  if (ownership.length === 0) return { ok: false, error: 'Set não encontrado.' };

  // Verifica que todos os trackIds pertencem ao set
  const current = await db
    .select({ trackId: setTracksTable.trackId })
    .from(setTracksTable)
    .where(eq(setTracksTable.setId, parsed.data.setId));
  const currentIds = new Set(current.map((r) => r.trackId));
  if (
    parsed.data.trackIds.length !== currentIds.size ||
    !parsed.data.trackIds.every((id) => currentIds.has(id))
  ) {
    return {
      ok: false,
      error: 'Lista de faixas difere do set atual. Recarregue e tente novamente.',
    };
  }

  // Atualiza order de cada trackId conforme índice
  // (sqlite libsql não tem transaction exposta direta; fazer updates em sequência)
  for (let i = 0; i < parsed.data.trackIds.length; i++) {
    await db
      .update(setTracksTable)
      .set({ order: i })
      .where(
        and(
          eq(setTracksTable.setId, parsed.data.setId),
          eq(setTracksTable.trackId, parsed.data.trackIds[i]),
        ),
      );
  }

  // Revalida só a view /sets/[id] (que é fora desta tela). Evita disparar
  // re-render do /sets/[id]/montar durante o drag — o componente client
  // já atualiza state otimista localmente.
  revalidatePath(`/sets/${parsed.data.setId}`);
  return { ok: true };
}

/* ============================================================
   triggerManualSync / reimportRecord — FR-033, FR-034, FR-034a (T090)
   ============================================================ */

import { runManualSync } from '@/lib/discogs/sync';
import { reimportRecordJob } from '@/lib/discogs/reimport';

export async function triggerManualSync(): Promise<
  ActionResult<{ outcome: string; newCount?: number; removedCount?: number }>
> {
  const user = await requireCurrentUser();
  if (user.discogsCredentialStatus === 'invalid') {
    return {
      ok: false,
      error: 'Seu token do Discogs está inválido. Atualize em /conta.',
    };
  }
  try {
    const result = await runManualSync(user.id);
    revalidatePath('/');
    revalidatePath('/status');
    if (result.outcome === 'erro') {
      return { ok: false, error: result.errorMessage };
    }
    if (result.outcome === 'rate_limited') {
      return {
        ok: false,
        error: `Rate limit do Discogs. Tente em ${result.retryAfterSeconds}s.`,
      };
    }
    return {
      ok: true,
      data: {
        outcome: result.outcome,
        newCount: 'newCount' in result ? result.newCount : undefined,
        removedCount: 'removedCount' in result ? result.removedCount : undefined,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro inesperado.',
    };
  }
}

const reimportSchema = z.object({
  recordId: z.number().int().positive(),
});

export async function reimportRecord(
  input: z.infer<typeof reimportSchema>,
): Promise<ActionResult<{ cooldownRemaining?: number }>> {
  const user = await requireCurrentUser();
  const parsed = reimportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input inválido.' };

  if (user.discogsCredentialStatus === 'invalid') {
    return {
      ok: false,
      error: 'Seu token do Discogs está inválido. Atualize em /conta.',
    };
  }

  const result = await reimportRecordJob(user.id, parsed.data.recordId);
  if (result.outcome === 'ok') {
    revalidatePath(`/disco/${parsed.data.recordId}`);
    revalidatePath('/status');
    return { ok: true };
  }
  if (result.outcome === 'rate_limited') {
    return {
      ok: false,
      error: `Aguarde ${result.retryAfterSeconds}s para reimportar este disco.`,
    };
  }
  return {
    ok: false,
    error: 'errorMessage' in result ? result.errorMessage : 'Erro inesperado.',
  };
}

/* ============================================================
   resolveTrackConflict — FR-037a (T099)
   ============================================================ */

const resolveConflictSchema = z.object({
  trackId: z.number().int().positive(),
  action: z.enum(['keep', 'discard']),
});

export async function resolveTrackConflict(
  input: z.infer<typeof resolveConflictSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = resolveConflictSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input inválido.' };

  const owned = await db
    .select({ trackId: tracksTable.id, recordId: tracksTable.recordId })
    .from(tracksTable)
    .innerJoin(records, eq(tracksTable.recordId, records.id))
    .where(and(eq(tracksTable.id, parsed.data.trackId), eq(records.userId, user.id)))
    .limit(1);
  if (owned.length === 0) return { ok: false, error: 'Faixa não encontrada.' };
  const recordId = owned[0].recordId;

  if (parsed.data.action === 'keep') {
    await db
      .update(tracksTable)
      .set({ conflict: false, conflictDetectedAt: null, updatedAt: new Date() })
      .where(eq(tracksTable.id, parsed.data.trackId));
  } else {
    await db.delete(tracksTable).where(eq(tracksTable.id, parsed.data.trackId));
  }

  revalidatePath('/status');
  revalidatePath(`/disco/${recordId}`);
  revalidatePath('/');
  return { ok: true };
}

/* ============================================================
   acknowledgeArchivedRecord — FR-036/FR-041 (T101)
   ============================================================ */

const acknowledgeSchema = z.object({
  recordId: z.number().int().positive(),
});

export async function acknowledgeArchivedRecord(
  input: z.infer<typeof acknowledgeSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = acknowledgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input inválido.' };

  const updated = await db
    .update(records)
    .set({ archivedAcknowledgedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(records.id, parsed.data.recordId), eq(records.userId, user.id)))
    .returning({ id: records.id });

  if (updated.length === 0) return { ok: false, error: 'Disco não encontrado.' };

  revalidatePath('/status');
  revalidatePath('/');
  return { ok: true };
}

/* ============================================================
   markStatusVisited — FR-041 (T097)
   ============================================================ */

export async function markStatusVisited(): Promise<ActionResult> {
  const user = await requireCurrentUser();
  await db
    .update(users)
    .set({ lastStatusVisitAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return { ok: true };
}

/* ============================================================
   deleteAccount — FR-042, FR-043 (T109)
   Hard-delete em cascata com confirmação "APAGAR" + revoga Clerk
   ============================================================ */

import { clerkClient } from '@clerk/nextjs/server';

const deleteAccountSchema = z.object({
  confirm: z.literal('APAGAR'),
});

export async function deleteAccount(
  input: z.infer<typeof deleteAccountSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Digite "APAGAR" para confirmar.' };
  }

  try {
    // Aborta syncRuns em andamento antes do cascade delete (FR-042)
    await db
      .update(syncRuns)
      .set({
        outcome: 'erro',
        errorMessage: 'Conta deletada pelo usuário',
        finishedAt: new Date(),
      })
      .where(and(eq(syncRuns.userId, user.id), eq(syncRuns.outcome, 'running')));

    // Hard-delete em cascata — FK ON DELETE CASCADE cuida de records,
    // tracks, sets, setTracks, syncRuns.
    await db.delete(users).where(eq(users.id, user.id));

    // Revoga conta Clerk (FR-043 — encerra todas as sessões)
    try {
      const client = await clerkClient();
      await client.users.deleteUser(user.clerkUserId);
    } catch (err) {
      // Se Clerk falhar, DB já foi limpo. Webhook `user.deleted` vai
      // ser no-op (users já deletado). Log e seguir.
      console.error('[deleteAccount] falha ao revogar Clerk:', err);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro inesperado ao apagar conta.',
    };
  }

  revalidatePath('/');
  return { ok: true };
}
