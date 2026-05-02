'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { asc, and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { invites, records, syncRuns, tracks, users } from '@/db/schema';
import { requireCurrentUser, requireOwner } from '@/lib/auth';
import { buildCollectionFilters } from '@/lib/queries/collection';
import { getUserFacets, recomputeFacets } from '@/lib/queries/user-facets';
import { matchesNormalizedText } from '@/lib/text';
import { cacheUser, revalidateUserCache } from '@/lib/cache';
import { encryptSecret } from '@/lib/crypto';
import { enrichTrackComment, getAdapter } from '@/lib/ai';
import { isModelSupported, MODELS_BY_PROVIDER } from '@/lib/ai/models';
import { buildTrackAnalysisPrompt } from '@/lib/prompts/track-analysis';
import {
  buildSetSuggestionsPrompt,
  parseAISuggestionsResponse,
} from '@/lib/prompts/set-suggestions';
import {
  listSetTracks,
  queryCandidates,
  type Candidate,
  type MontarFilters,
} from '@/lib/queries/montar';
import { encryptPAT } from '@/lib/crypto';
import { markCredentialValid } from '@/lib/discogs';
import {
  DiscogsAuthError,
  DiscogsError,
  fetchCollectionPage,
} from '@/lib/discogs/client';
import { runInitialImport } from '@/lib/discogs/import';
import { killZombieSyncRuns } from '@/lib/discogs/zombie';

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

  // Reclama runs zumbis (processos mortos sem finalizar) antes de decidir
  // se já há um em andamento — essencial em serverless, onde funções podem
  // morrer silenciosamente antes de atualizar o estado do run.
  await killZombieSyncRuns(user.id, 'initial_import');

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
  // 010 (Bug 13): startedAt do último syncRun + lastAck do user.
  // Componente client decide visibilidade comparando os dois.
  runStartedAt: Date | null;
  lastAck: Date | null;
};

// Inc 23 follow-up (022 / Bug 16): parte de leitura cacheada com
// TTL curto (10s) — `<ImportProgressCard>` faz polling 3s; cache
// reduz ~70% dos reads do polling preservando UX (stale máx 10s).
async function getImportProgressReadRaw(userId: number): Promise<ImportProgress> {
  const latest = await db
    .select({
      outcome: syncRuns.outcome,
      snapshotJson: syncRuns.snapshotJson,
      errorMessage: syncRuns.errorMessage,
      newCount: syncRuns.newCount,
      startedAt: syncRuns.startedAt,
    })
    .from(syncRuns)
    .where(and(eq(syncRuns.userId, userId), eq(syncRuns.kind, 'initial_import')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  // Inc 24: derivado de user_facets em vez de COUNT(*) em records.
  const facets = await getUserFacets(userId);
  const recordCount = facets.recordsTotal;

  const [{ ack: lastAck = null } = { ack: null }] = await db
    .select({ ack: users.importAcknowledgedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return computeImportProgress(userId, latest, Number(recordCount), lastAck);
}

const getImportProgressRead = cacheUser(getImportProgressReadRaw, 'getImportProgress', {
  revalidate: 10,
});

export async function getImportProgress(): Promise<ImportProgress> {
  const user = await requireCurrentUser();

  // Inc 26: zombie cleanup movido pra cron diário (`/api/cron/sync-daily`).
  // Trade-off: zombie pode demorar até 24h pra ser detectado, mas evita
  // 1 UPDATE em sync_runs por load de página.

  return getImportProgressRead(user.id);
}

/**
 * Inc 26 — Versão "light" pra render condicional na home.
 *
 * Caso comum (DJ com import já reconhecido + idle): retorna
 * `{ shouldShow: false }` em 1 SELECT mínimo (`sync_runs latest`).
 * Caso edge (running ou unacked): chama `getImportProgress()` cheio
 * pra preencher x/y/outcome — custo igual ao atual.
 *
 * Reduz ~3 queries/load pra 99% dos loads (DJ com import antigo
 * já reconhecido).
 */
export async function getImportProgressLight(): Promise<
  | { shouldShow: false }
  | { shouldShow: true; progress: ImportProgress }
> {
  const user = await requireCurrentUser(); // Inc 26: cached via react.cache()
  const lastAck = user.importAcknowledgedAt;

  const [latest] = await db
    .select({
      outcome: syncRuns.outcome,
      startedAt: syncRuns.startedAt,
    })
    .from(syncRuns)
    .where(and(eq(syncRuns.userId, user.id), eq(syncRuns.kind, 'initial_import')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const isRunning = latest?.outcome === 'running';
  const isUnacked =
    latest?.startedAt != null &&
    (lastAck == null || latest.startedAt.getTime() > lastAck.getTime());

  if (!isRunning && !isUnacked) {
    return { shouldShow: false };
  }

  const progress = await getImportProgress();
  return { shouldShow: true, progress };
}

type LatestRow = {
  outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial';
  snapshotJson: string | null;
  errorMessage: string | null;
  newCount: number;
  startedAt: Date | null;
};

function computeImportProgress(
  userId: number,
  latest: LatestRow[],
  recordCount: number,
  lastAck: Date | null,
): ImportProgress {
  const x = recordCount;

  if (latest.length === 0) {
    return {
      running: false,
      x,
      y: x, // não conhecido; exibe apenas X
      outcome: 'idle',
      errorMessage: null,
      runStartedAt: null,
      lastAck,
    };
  }

  const row = latest[0];

  // Resolve y (totalItems) primeiro — precisamos dele pra decidir
  // needsResume abaixo.
  let y = x;
  if (row.snapshotJson) {
    try {
      const parsed = JSON.parse(row.snapshotJson) as { totalItems?: number };
      if (typeof parsed.totalItems === 'number') y = parsed.totalItems;
    } catch {
      // ignora snapshot corrompido
    }
  }

  // Runs zumbis (processo morreu sem finalizar) são estado transiente:
  // o worker morreu, precisamos retomar. O polling global chama este
  // função a cada 10s; aqui é onde o ciclo "worker morre → novo worker"
  // se auto-fecha, em qualquer rota aberta.
  const isZombieErro =
    row.outcome === 'erro' && /(run zumbi|killed on restart)/i.test(row.errorMessage ?? '');
  const isZombieParcial =
    row.outcome === 'parcial' && /(run zumbi|killed on restart)/i.test(row.errorMessage ?? '');
  const snapshotMissing = !row.snapshotJson;

  const needsResume =
    (row.outcome === 'parcial' ||
      row.outcome === 'rate_limited' ||
      isZombieErro ||
      isZombieParcial) &&
    (x < y || snapshotMissing);

  if (needsResume) {
    after(async () => {
      try {
        await runInitialImport(userId);
      } catch (err) {
        console.error('[sulco] resume runInitialImport falhou:', err);
      }
    });
  }

  // UI: zumbi residual é transiente, não expõe mensagem de erro ao DJ.
  // Mostra "idle" com x atual enquanto o novo worker sobe.
  const isZombieResidual = isZombieErro || isZombieParcial;

  return {
    running: row.outcome === 'running' || needsResume,
    x,
    y,
    outcome: needsResume
      ? 'running'
      : isZombieResidual
        ? 'idle'
        : row.outcome,
    errorMessage: isZombieResidual ? null : row.errorMessage,
    runStartedAt: row.startedAt,
    lastAck,
  };
}

/* ============================================================
   acknowledgeImportProgress — 010 (Bug 13)
   Marca o usuário corrente como tendo reconhecido o estado terminal
   do banner de import. Próximo render do RSC `/` recebe `lastAck >=
   runStartedAt` e o componente decide não renderizar.
   ============================================================ */

export async function acknowledgeImportProgress(): Promise<ActionResult> {
  const user = await requireCurrentUser();

  await db
    .update(users)
    .set({ importAcknowledgedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidatePath('/');
  revalidateUserCache(user.id);
  return { ok: true };
}

/* ============================================================
   testAndSaveAIConfig + removeAIConfig — 012 (Inc 14, BYOK)
   Config de IA do DJ. "Testar" é o único caminho de salvar
   (FR-005): ping bem-sucedido persiste imediatamente. Sem botão
   "Salvar sem testar". Timeout 10s (Q3 da clarificação).
   ============================================================ */

const aiConfigInputSchema = z.object({
  provider: z.enum(['gemini', 'anthropic', 'openai', 'deepseek', 'qwen']),
  model: z.string().min(1).max(100),
  apiKey: z.string().trim().min(10).max(500),
});

const PING_TIMEOUT_MS = 10_000;

export async function testAndSaveAIConfig(
  input: z.infer<typeof aiConfigInputSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();

  const parsed = aiConfigInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos.' };
  }
  const { provider, model, apiKey } = parsed.data;

  if (!isModelSupported(provider, model)) {
    return {
      ok: false,
      error: `Modelo "${model}" não suportado pra ${provider}. Modelos válidos: ${MODELS_BY_PROVIDER[provider].join(', ')}.`,
    };
  }

  const adapter = getAdapter(provider);

  // Promise.race com timeout 10s pra evitar travar o DJ esperando.
  const pingPromise = adapter.ping({ apiKey, model });
  const timeoutPromise = new Promise<{ ok: false; error: { kind: 'timeout'; message: string } }>(
    (resolve) => {
      setTimeout(
        () =>
          resolve({
            ok: false,
            error: { kind: 'timeout', message: 'Provider não respondeu — tente novamente.' },
          }),
        PING_TIMEOUT_MS,
      );
    },
  );

  const result = await Promise.race([pingPromise, timeoutPromise]);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  await db
    .update(users)
    .set({
      aiProvider: provider,
      aiModel: model,
      aiApiKeyEncrypted: encryptSecret(apiKey),
    })
    .where(eq(users.id, user.id));

  revalidatePath('/conta');
  return { ok: true };
}

export async function removeAIConfig(): Promise<ActionResult> {
  const user = await requireCurrentUser();

  await db
    .update(users)
    .set({
      aiProvider: null,
      aiModel: null,
      aiApiKeyEncrypted: null,
    })
    .where(eq(users.id, user.id));

  revalidatePath('/conta');
  return { ok: true };
}

/* ============================================================
   analyzeTrackWithAI — 013 (Inc 13, Análise via IA)
   Gera análise musical pra uma faixa via provider configurado pelo
   DJ (Inc 14). Persiste em tracks.ai_analysis. Ownership check
   estrito. Timeout 30s (FR-012, mitigando que enrichTrackComment do
   Inc 14 não tem timeout próprio).
   ============================================================ */

const analyzeTrackInputSchema = z.object({
  trackId: z.number().int().positive(),
});

const ANALYZE_TIMEOUT_MS = 30_000;

export async function analyzeTrackWithAI(
  input: z.infer<typeof analyzeTrackInputSchema>,
): Promise<ActionResult<{ text: string }>> {
  const user = await requireCurrentUser();

  const parsed = analyzeTrackInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos.' };
  }
  const { trackId } = parsed.data;

  // Ownership check + load do track + record numa query única.
  const rows = await db
    .select({
      trackPosition: tracks.position,
      trackTitle: tracks.title,
      bpm: tracks.bpm,
      musicalKey: tracks.musicalKey,
      energy: tracks.energy,
      recordId: records.id,
      artist: records.artist,
      album: records.title,
      year: records.year,
      genres: records.genres,
      styles: records.styles,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(tracks.id, trackId), eq(records.userId, user.id)))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: 'Faixa não encontrada.' };
  }
  const row = rows[0];

  const prompt = buildTrackAnalysisPrompt({
    artist: row.artist,
    album: row.album,
    year: row.year,
    trackTitle: row.trackTitle,
    position: row.trackPosition,
    genres: (row.genres ?? []) as string[],
    styles: (row.styles ?? []) as string[],
    bpm: row.bpm,
    musicalKey: row.musicalKey,
    energy: row.energy,
  });

  // Promise.race com timeout 30s — mitiga finding I1 do speckit.analyze
  // (enrichTrackComment do Inc 14 não tem timeout próprio).
  const aiPromise = enrichTrackComment(user.id, prompt);
  const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) => {
    setTimeout(
      () => resolve({ ok: false, error: 'Provider não respondeu — tente novamente.' }),
      ANALYZE_TIMEOUT_MS,
    );
  });

  const result = await Promise.race([aiPromise, timeoutPromise]);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const text = result.text.trim();
  if (text.length === 0) {
    return { ok: false, error: 'IA retornou resposta vazia — tente novamente.' };
  }

  await db
    .update(tracks)
    .set({ aiAnalysis: text, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));

  revalidatePath(`/disco/${row.recordId}`);
  revalidateUserCache(user.id);
  return { ok: true, data: { text } };
}

/* ============================================================
   updateTrackAiAnalysis — 013 (Inc 13)
   Edição manual do campo `tracks.ai_analysis`. Auto-save-on-blur
   no client (mesmo pattern do `comment`). Trim → null pra evitar
   string vazia no DB.
   ============================================================ */

const updateAiAnalysisSchema = z.object({
  trackId: z.number().int().positive(),
  recordId: z.number().int().positive(),
  text: z.string().max(5000).nullable(),
});

export async function updateTrackAiAnalysis(
  input: z.infer<typeof updateAiAnalysisSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();

  const parsed = updateAiAnalysisSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos.' };
  }
  const { trackId, recordId, text } = parsed.data;

  // Ownership check via record_id IN (...) com filtro por user.
  const ownerRows = await db
    .select({ id: tracks.id })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(
      and(
        eq(tracks.id, trackId),
        eq(tracks.recordId, recordId),
        eq(records.userId, user.id),
      ),
    )
    .limit(1);

  if (ownerRows.length === 0) {
    return { ok: false, error: 'Faixa não encontrada.' };
  }

  await db
    .update(tracks)
    .set({ aiAnalysis: text, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));

  revalidatePath(`/disco/${recordId}`);
  revalidateUserCache(user.id);
  return { ok: true };
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

  // Inc 24: recompute síncrono — afeta records_active/unrated/discarded.
  try {
    await recomputeFacets(user.id);
  } catch (err) {
    console.error('[recomputeFacets] erro pós-write (updateRecordStatus):', err);
  }

  revalidatePath('/');
  revalidatePath(`/disco/${parsed.data.recordId}`);
  revalidateUserCache(user.id);
  return { ok: true };
}

/* ============================================================
   updateTrackCuration — FR-016..FR-020c (T059)
   Atualização parcial da curadoria de uma faixa.
   ============================================================ */

import { tracks as tracksTable } from '@/db/schema';
import { normalizeVocabTerm, DEFAULT_MOOD_SEEDS, DEFAULT_CONTEXT_SEEDS } from '@/lib/vocabulary';

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

  // 005 — FR-006b + FR-012 + FR-013: edição manual em qualquer um dos
  // 4 campos de audio features (incluindo `{ bpm: null }` = limpar)
  // move `audioFeaturesSource` pra 'manual' e trava o bloco. Detecção
  // via presença de chave no input ORIGINAL, não no parsed (que converte
  // ausência em undefined). Isso distingue `{ trackId }` (sem intenção)
  // de `{ trackId, bpm: null }` (intenção de limpar).
  const inputKeys = input as Record<string, unknown>;
  const touchedAudioFeature =
    'bpm' in inputKeys ||
    'musicalKey' in inputKeys ||
    'energy' in inputKeys ||
    'moods' in inputKeys;
  if (touchedAudioFeature) {
    payload.audioFeaturesSource = 'manual';
  }

  await db
    .update(tracksTable)
    .set(payload)
    .where(eq(tracksTable.id, parsed.data.trackId));

  // Inc 24: recompute síncrono — afeta tracks_selected_total + moods/contexts.
  try {
    await recomputeFacets(user.id);
  } catch (err) {
    console.error('[recomputeFacets] erro pós-write (updateTrackCuration):', err);
  }

  revalidatePath(`/disco/${parsed.data.recordId}`);
  revalidatePath('/');
  revalidateUserCache(user.id);
  return { ok: true };
}

/* ============================================================
   listUserVocabulary — FR-017a (T062)
   Retorna termos ordenados (uso do DJ por frequência + sementes alfa).
   ============================================================ */

// Inc 24: derivado de user_facets.moods/contexts (1 SELECT da row).
// Termos do user já vêm ordenados por frequência (aggregateVocabulary
// no helper). Aqui só mergeamos com sementes ainda não usadas.
export async function listUserVocabulary(
  kind: 'moods' | 'contexts',
): Promise<string[]> {
  const user = await requireCurrentUser();
  const facets = await getUserFacets(user.id);
  const userOrdered = (kind === 'moods' ? facets.moods : facets.contexts)
    .map(normalizeVocabTerm)
    .filter((t) => t.length > 0);
  const userSet = new Set(userOrdered);
  const seeds = kind === 'moods' ? DEFAULT_MOOD_SEEDS : DEFAULT_CONTEXT_SEEDS;
  const seedsRemaining = seeds
    .map(normalizeVocabTerm)
    .filter((s) => !userSet.has(s))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [...userOrdered, ...seedsRemaining];
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

  // Inc 24: recompute síncrono — afeta shelves_json se shelfLocation mudou.
  try {
    await recomputeFacets(user.id);
  } catch (err) {
    console.error('[recomputeFacets] erro pós-write (updateRecordAuthorFields):', err);
  }

  revalidatePath(`/disco/${parsed.data.recordId}`);
  revalidatePath('/');
  revalidateUserCache(user.id);
  return { ok: true };
}

/* ============================================================
   enrichRecordOnDemand — 005 (refactor on-demand)
   DJ clica "Buscar sugestões" em /disco/[id] → roda cadeia
   Discogs→MB→AB e grava audio features sugeridas respeitando
   Princípio I. Revalida a página no fim.
   ============================================================ */

const enrichRecordSchema = z.object({
  recordId: z.number().int().positive(),
});

export async function enrichRecordOnDemand(
  input: z.infer<typeof enrichRecordSchema>,
): Promise<
  ActionResult<{
    totalTracks: number;
    tracksAlreadyProcessed: number;
    mbidsResolved: number;
    tracksUpdated: number;
    tracksSkipped: number;
    tracksErrored: number;
  }>
> {
  const user = await requireCurrentUser();
  const parsed = enrichRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  // Ownership check explícito antes de bater em APIs externas
  const own = await db
    .select({ id: records.id })
    .from(records)
    .where(and(eq(records.id, parsed.data.recordId), eq(records.userId, user.id)))
    .limit(1);
  if (own.length === 0) {
    return { ok: false, error: 'Disco não encontrado.' };
  }

  // Import dinâmico pra evitar loading de 'server-only' em edge casos
  const { enrichRecord } = await import('@/lib/acousticbrainz');
  try {
    const summary = await enrichRecord(user.id, parsed.data.recordId);
    revalidatePath(`/disco/${parsed.data.recordId}`);
    revalidateUserCache(user.id);
    return {
      ok: true,
      data: {
        totalTracks: summary.totalTracks,
        tracksAlreadyProcessed: summary.tracksAlreadyProcessed,
        mbidsResolved: summary.mbidsResolved,
        tracksUpdated: summary.tracksUpdated,
        tracksSkipped: summary.tracksSkipped,
        tracksErrored: summary.tracksErrored,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Fontes externas indisponíveis: ${message}` };
  }
}

/* ============================================================
   pickRandomUnratedRecord — 006 (curadoria aleatória) + 011 (filtros)
   Sorteia 1 record unrated do acervo do user e devolve o id.
   Cliente faz router.push pra evitar Server Action redirect throw.

   Inc 011: aceita filtros opcionais (text/genres/styles/bomba) com
   semântica idêntica à listagem da home, via helper compartilhado
   `buildCollectionFilters`. status='unrated' e archived=false
   permanecem forçados internamente (FR-002, FR-003).
   ============================================================ */

const pickRandomFiltersSchema = z
  .object({
    text: z.string().trim().default(''),
    genres: z.array(z.string()).default([]),
    styles: z.array(z.string()).default([]),
    bomba: z.enum(['any', 'only', 'none']).default('any'),
  })
  .optional();

export async function pickRandomUnratedRecord(
  input?: z.input<typeof pickRandomFiltersSchema>,
): Promise<ActionResult<{ recordId: number } | { recordId: null }>> {
  const user = await requireCurrentUser();

  const parsed = pickRandomFiltersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Filtros inválidos.' };
  }

  // Filtros base: ownership + não-arquivado + status unrated forçado
  // (Princípio I + FR-002/FR-003 do 011).
  const conds = [
    eq(records.userId, user.id),
    eq(records.archived, false),
    eq(records.status, 'unrated'),
  ];

  // Filtros refinos opcionais (text/genres/styles/bomba).
  // Inc 23 (022): fast path SQL quando text vazio (1 row read).
  // Slow path JS post-filter (Inc 18) preservado quando há text.
  const textTerm = parsed.data?.text?.trim() ?? '';
  const hasText = textTerm.length > 0;

  if (parsed.data) {
    conds.push(...buildCollectionFilters({ ...parsed.data, omitText: true }));
  }

  // FAST PATH (Inc 23): sem text, random direto no SQL — 1 row read.
  if (!hasText) {
    const row = await db
      .select({ id: records.id })
      .from(records)
      .where(and(...conds))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    if (row.length === 0) {
      return { ok: true, data: { recordId: null } };
    }
    return { ok: true, data: { recordId: row[0].id } };
  }

  // SLOW PATH (Inc 18): com text, JS post-filter accent-insensitive.
  const candidates = await db
    .select({
      id: records.id,
      artist: records.artist,
      title: records.title,
      label: records.label,
    })
    .from(records)
    .where(and(...conds));

  if (candidates.length === 0) {
    return { ok: true, data: { recordId: null } };
  }

  const filtered = candidates.filter((c) =>
    matchesNormalizedText([c.artist, c.title, c.label], textTerm),
  );

  if (filtered.length === 0) {
    return { ok: true, data: { recordId: null } };
  }

  const picked = filtered[Math.floor(Math.random() * filtered.length)];
  return { ok: true, data: { recordId: picked.id } };
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
  revalidateUserCache(user.id);
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

/* ============================================================
   suggestSetTracks — 014 (Inc 1, Briefing com IA em /sets/montar)
   Orquestra: ownership → carrega briefing+setTracks+catálogo
   (queryCandidates com rankByCuration+limit 50) → curto-circuita
   se vazio → monta prompt → enrichTrackComment com Promise.race
   60s → parse JSON defensivo → filtragem anti-hallucination/
   anti-duplicação → retorna sugestões + candidatos referenciados.

   IA NÃO escreve em set_tracks. Cada sugestão tem botão
   "Adicionar ao set" no client que dispara addTrackToSet.
   ============================================================ */

const suggestInputSchema = z.object({
  setId: z.number().int().positive(),
});

const SUGGEST_TIMEOUT_MS = 60_000;
const SUGGEST_CANDIDATES_LIMIT = 50;
const SUGGEST_MAX_RESULTS = 10;

export async function suggestSetTracks(
  input: z.infer<typeof suggestInputSchema>,
): Promise<
  ActionResult<{
    suggestions: { trackId: number; justificativa: string }[];
    candidates: Candidate[];
  }>
> {
  const user = await requireCurrentUser();

  const parsed = suggestInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos.' };
  }
  const { setId } = parsed.data;

  // Ownership + load do set
  const setRows = await db
    .select({
      id: setsTable.id,
      name: setsTable.name,
      eventDate: setsTable.eventDate,
      location: setsTable.location,
      briefing: setsTable.briefing,
      montarFiltersJson: setsTable.montarFiltersJson,
    })
    .from(setsTable)
    .where(and(eq(setsTable.id, setId), eq(setsTable.userId, user.id)))
    .limit(1);

  if (setRows.length === 0) {
    return { ok: false, error: 'Set não encontrado.' };
  }
  const set = setRows[0];

  // Faixas atuais do set (L2 do prompt — sem ceiling, todas vão)
  const currentTracks = await listSetTracks(setId, user.id);
  const inSetIds = currentTracks.map((t) => t.trackId);

  // Parse dos filtros persistidos (montar_filters_json)
  let filters: MontarFilters = {};
  try {
    const raw = set.montarFiltersJson;
    if (raw && raw.trim().length > 0) {
      filters = JSON.parse(raw) as MontarFilters;
    }
  } catch {
    // Filtros corrompidos: trata como vazio em vez de falhar
    filters = {};
  }

  // Catálogo elegível (L3) — truncado em 50, ranqueado por curadoria
  const candidates = await queryCandidates(user.id, filters, {
    excludeTrackIds: inSetIds,
    rankByCuration: true,
    limit: SUGGEST_CANDIDATES_LIMIT,
  });

  // Curto-circuito antes de chamar IA (FR-011, SC-006)
  if (candidates.length === 0) {
    return {
      ok: false,
      error: 'Nenhum candidato elegível com os filtros atuais. Relaxe os filtros e tente de novo.',
    };
  }

  // Monta prompt
  const prompt = buildSetSuggestionsPrompt({
    briefing: set.briefing,
    setName: set.name,
    eventDate: set.eventDate,
    location: set.location,
    setTracks: currentTracks.map((t) => ({
      artist: t.artist,
      title: t.title,
      position: t.position,
    })),
    candidates,
  });

  // Promise.race com timeout 60s
  const aiPromise = enrichTrackComment(user.id, prompt);
  const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) => {
    setTimeout(
      () => resolve({ ok: false, error: 'Provider não respondeu — tente novamente.' }),
      SUGGEST_TIMEOUT_MS,
    );
  });

  const aiResult = await Promise.race([aiPromise, timeoutPromise]);
  if (!aiResult.ok) {
    return { ok: false, error: aiResult.error };
  }

  // Parse JSON defensivo
  const parseResult = parseAISuggestionsResponse(aiResult.text);
  if (!parseResult.ok) {
    // Log completo pra debugar formato real da resposta em prod.
    console.error('[suggestSetTracks] parse falhou. Resposta crua:', aiResult.text);
    return {
      ok: false,
      error: 'IA retornou resposta em formato inesperado — tente novamente.',
    };
  }

  // Filtragem anti-hallucination + anti-duplicação + dedup
  const candidateIds = new Set(candidates.map((c) => c.id));
  const inSetIdsSet = new Set(inSetIds);
  const seen = new Set<number>();
  const filteredSuggestions = parseResult.data
    .filter((s) => candidateIds.has(s.trackId)) // existe no catálogo
    .filter((s) => !inSetIdsSet.has(s.trackId)) // não está no set (defensivo — já excluído pela query)
    .filter((s) => {
      if (seen.has(s.trackId)) return false;
      seen.add(s.trackId);
      return true;
    })
    .slice(0, SUGGEST_MAX_RESULTS);

  if (filteredSuggestions.length === 0) {
    return {
      ok: false,
      error: 'IA não retornou sugestões válidas — tente novamente.',
    };
  }

  // Reduzir payload — só candidates referenciados nas sugestões finais (mitiga O1)
  const usedIds = new Set(filteredSuggestions.map((s) => s.trackId));
  const usedCandidates = candidates.filter((c) => usedIds.has(c.id));

  return {
    ok: true,
    data: {
      suggestions: filteredSuggestions,
      candidates: usedCandidates,
    },
  };
}

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

/* ============================================================
   cancelRunningSync — Bug 8b
   Marca runs `manual` em outcome='running' do user atual como
   'erro'/cancelado. Pra DJ que vê sync demorando muito e quer
   abortar antes do killZombieSyncRuns (que só roda em >65s).
   ============================================================ */

export async function cancelRunningSync(): Promise<
  ActionResult<{ cancelledCount: number }>
> {
  const user = await requireCurrentUser();
  // Cancela apenas runs do próprio user, kind='manual', em running.
  // initial_import e reimport_record continuam intocados — esses
  // têm fluxo próprio e cancelar deles abre risco de inconsistência.
  // daily_auto também não — é cron, não tem usuário esperando.
  const result = await db
    .update(syncRuns)
    .set({
      outcome: 'erro',
      finishedAt: new Date(),
      errorMessage: sql`COALESCE(${syncRuns.errorMessage}, '') || ' [cancelado pelo DJ via /status]'`,
    })
    .where(
      and(
        eq(syncRuns.userId, user.id),
        eq(syncRuns.kind, 'manual'),
        eq(syncRuns.outcome, 'running'),
      ),
    )
    .returning({ id: syncRuns.id });

  revalidatePath('/status');
  revalidatePath('/');
  return { ok: true, data: { cancelledCount: result.length } };
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

  // Inc 24: recompute síncrono (defensivo — ack não muda archived
  // mas mantém row atualizada).
  try {
    await recomputeFacets(user.id);
  } catch (err) {
    console.error('[recomputeFacets] erro pós-write (acknowledgeArchivedRecord):', err);
  }

  revalidatePath('/status');
  revalidatePath('/');
  revalidateUserCache(user.id);
  return { ok: true };
}

/* ============================================================
   acknowledgeAllArchived — Inc 11 (017)
   Bulk acknowledge de todos os archived pendentes do user atual.
   Single-statement UPDATE; atomicidade garantida pelo SQLite.
   ============================================================ */

export async function acknowledgeAllArchived(): Promise<
  ActionResult<{ count: number }>
> {
  const user = await requireCurrentUser();

  try {
    const updated = await db
      .update(records)
      .set({ archivedAcknowledgedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(records.userId, user.id),
          eq(records.archived, true),
          isNull(records.archivedAcknowledgedAt),
        ),
      )
      .returning({ id: records.id });

    // Inc 24: recompute síncrono (defensivo — ack não muda archived,
    // mas mantém row atualizada).
    try {
      await recomputeFacets(user.id);
    } catch (err) {
      console.error('[recomputeFacets] erro pós-write (acknowledgeAllArchived):', err);
    }

    revalidatePath('/status');
    revalidatePath('/');
    revalidateUserCache(user.id);
    return { ok: true, data: { count: updated.length } };
  } catch (err) {
    console.error('[acknowledgeAllArchived] erro:', err);
    return { ok: false, error: 'Falha ao reconhecer — tente novamente.' };
  }
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

/* ============================================================
   addInvite / removeInvite / listInvites — FR-001, FR-002, FR-003
   (002-multi-conta) — gestão da allowlist interna. Só owner pode chamar.
   ============================================================ */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido.').max(254),
});

export async function addInvite(input: { email: string }): Promise<ActionResult> {
  await requireOwner();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Email inválido.' };
  }
  const email = parsed.data.email;

  await db
    .insert(invites)
    .values({ email })
    .onConflictDoNothing({ target: invites.email });

  // Promove retroativamente qualquer user existente com esse email
  // (caso a pessoa tenha criado conta antes de ser convidada).
  await db
    .update(users)
    .set({ allowlisted: true, updatedAt: new Date() })
    .where(sql`LOWER(${users.email}) = ${email}`);

  revalidatePath('/admin/convites');
  revalidatePath('/admin');
  return { ok: true };
}

export async function removeInvite(input: { email: string }): Promise<ActionResult> {
  await requireOwner();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Email inválido.' };
  }
  const email = parsed.data.email;

  await db.delete(invites).where(sql`LOWER(${invites.email}) = ${email}`);

  // Desaloca users com esse email EXCETO owner (invariante I4 do data-model).
  await db
    .update(users)
    .set({ allowlisted: false, updatedAt: new Date() })
    .where(
      and(
        sql`LOWER(${users.email}) = ${email}`,
        eq(users.isOwner, false),
      ),
    );

  revalidatePath('/admin/convites');
  revalidatePath('/admin');
  return { ok: true };
}

export async function listInvites(): Promise<
  { id: number; email: string; createdAt: Date | null }[]
> {
  await requireOwner();
  return db
    .select({
      id: invites.id,
      email: invites.email,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .orderBy(asc(invites.createdAt));
}

/* ============================================================
   resolveTrackPreview / invalidateTrackPreview — 008
   Lazy on-demand: 1º click busca Deezer e cacheia; subsequentes
   leem do DB. Princípio I: nunca toca campos AUTHOR.
   ============================================================ */

const trackPreviewSchema = z.object({
  trackId: z.number().int().positive(),
});

export async function resolveTrackPreview(
  input: z.infer<typeof trackPreviewSchema>,
): Promise<ActionResult<{ deezerUrl: string | null; cached: boolean }>> {
  const user = await requireCurrentUser();
  const parsed = trackPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  // Ownership check + read cache + read artist em uma query
  const rows = await db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      artist: records.artist,
      previewUrl: tracks.previewUrl,
      previewUrlCachedAt: tracks.previewUrlCachedAt,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(tracks.id, parsed.data.trackId), eq(records.userId, user.id)))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: 'Faixa não encontrada.' };
  }
  const row = rows[0];

  // Cache hit: previewUrlCachedAt != null indica tentativa prévia.
  // previewUrl '' é marker "tentou, sem dado" → retorna null pro cliente.
  if (row.previewUrlCachedAt != null) {
    const deezerUrl =
      row.previewUrl && row.previewUrl.length > 0 ? row.previewUrl : null;
    return { ok: true, data: { deezerUrl, cached: true } };
  }

  // Cache miss → busca Deezer
  const { searchTrackPreview, DeezerServiceError } = await import(
    '@/lib/preview/deezer'
  );
  let hit: Awaited<ReturnType<typeof searchTrackPreview>>;
  try {
    hit = await searchTrackPreview(row.artist, row.title);
  } catch (err) {
    // Network/5xx: NÃO persiste cache (próximo retry vale)
    const message =
      err instanceof DeezerServiceError ? err.message : 'Deezer indisponível';
    return { ok: false, error: message };
  }

  // Persiste resultado: URL, marker '' (sem hit ou hit sem preview).
  // Princípio I: UPDATE só toca preview_url + preview_url_cached_at.
  const deezerUrl = hit?.previewUrl ?? null;
  const cacheValue = deezerUrl ?? '';
  await db
    .update(tracks)
    .set({
      previewUrl: cacheValue,
      previewUrlCachedAt: new Date(),
    })
    .where(eq(tracks.id, row.trackId));

  return { ok: true, data: { deezerUrl, cached: false } };
}

export async function invalidateTrackPreview(
  input: z.infer<typeof trackPreviewSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = trackPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  // Ownership check antes do UPDATE
  const own = await db
    .select({ id: tracks.id })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(tracks.id, parsed.data.trackId), eq(records.userId, user.id)))
    .limit(1);
  if (own.length === 0) {
    return { ok: false, error: 'Faixa não encontrada.' };
  }

  await db
    .update(tracks)
    .set({ previewUrl: null, previewUrlCachedAt: null })
    .where(eq(tracks.id, parsed.data.trackId));

  return { ok: true };
}

