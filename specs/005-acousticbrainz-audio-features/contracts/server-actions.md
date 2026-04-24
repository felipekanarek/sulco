# Contratos — Server Actions e API interna

## Funções do módulo `src/lib/acousticbrainz/`

### `enrichTrack(userId, trackId): Promise<EnrichOutcome>`

Tenta enriquecer UMA faixa específica. Reutilizável pra testes e
workers. Idempotente (safe chamar múltiplas vezes).

```ts
type EnrichOutcome =
  | { outcome: 'updated'; fields: Array<'bpm' | 'musicalKey' | 'energy' | 'moods'> }
  | { outcome: 'skipped'; reason: 'manual' | 'no_mbid' | 'no_ab_data' | 'recently_tried' }
  | { outcome: 'error'; message: string };
```

### `enrichRecord(userId, recordId): Promise<RecordEnrichSummary>`

Enriquece todas as faixas de um disco. Chama MB uma vez (release
fetch), depois AB N vezes (uma por faixa).

```ts
type RecordEnrichSummary = {
  recordId: number;
  mbidsResolved: number;
  tracksUpdated: number;
  tracksSkipped: number;
  tracksErrored: number;
};
```

Usado pelo trigger imediato pós-import.

### `enrichUserBacklog(userId, opts?): Promise<BacklogRunSummary>`

Processa backlog do user. Seleciona faixas elegíveis, itera por disco.
Respeita rate limits. Atualiza `syncRuns`.

```ts
type BacklogRunSummary = {
  recordsProcessed: number;
  tracksUpdated: number;
  tracksSkipped: number;
  errors: number;
  durationMs: number;
};

type BacklogOpts = {
  maxRecords?: number;     // default: ilimitado
  maxDurationMs?: number;  // default: 15 minutos (SC-005 target)
};
```

Chamado pelo cron diário após `runDailyAutoSync`.

**Query de elegibilidade** (documentada também em `data-model.md`):

```sql
SELECT t.id, t.record_id, t.position, t.title, t.mbid,
       t.bpm, t.musical_key, t.energy, t.moods
FROM tracks t
JOIN records r ON r.id = t.record_id
WHERE r.user_id = :userId
  AND r.archived = 0
  AND r.status = 'active'
  AND t.audio_features_source IS NULL
  AND (t.audio_features_synced_at IS NULL
       OR t.audio_features_synced_at < unixepoch() - (30 * 86400))
ORDER BY t.record_id, t.position;
```

---

## Extensões em `src/lib/actions.ts`

### `updateTrackCuration` (action existente) — comportamento adicional

Quando a action recebe alteração em `bpm`, `musicalKey`, `energy` ou
`moods`, deve **sempre** definir `audio_features_source = 'manual'`
na mesma transação — mesmo que o valor novo seja igual ao antigo ou
se a mudança for apenas em UM dos 4 campos.

**Assinatura não muda**:

```ts
updateTrackCuration(input: {
  trackId: number;
  bpm?: number | null;
  musicalKey?: string | null;
  energy?: number | null;
  moods?: string[] | null;
  // outros campos autorais (comment, fineGenre, etc.) — inalterados
}): Promise<{ ok: true } | { ok: false; error: string }>
```

**Comportamento novo (side effect)**:

```ts
// Se qualquer bpm/musicalKey/energy/moods mudou, adiciona:
updates.audioFeaturesSource = 'manual';
```

Invariante: o UPDATE que grava `audioFeaturesSource = 'manual'` NÃO
tem cláusula `WHERE audio_features_source IS NULL`. DJ sempre vence.

---

## Extensão em `src/app/api/cron/sync-daily/route.ts`

Fluxo novo:

```ts
for (const user of eligibleUsers) {
  // 1) Sync Discogs (inalterado)
  await runDailyAutoSync(user.id);
  // 2) Enriquecimento (novo, absorve falhas)
  try {
    await enrichUserBacklog(user.id, { maxDurationMs: 15 * 60 * 1000 });
  } catch (err) {
    console.warn('[enrich-cron] failed for user', user.id, err);
  }
}
```

Nenhuma mudança no contrato HTTP (método, auth, status codes). Apenas
extensão do comportamento interno.

---

## Extensão em `src/lib/discogs/apply-update.ts`

Após `INSERT` de novas faixas (linhas `tracks` criadas no import/sync):

```ts
// Em apply-update.ts, depois de insertTracks():
const newRecordIds = /* ids dos discos que ganharam faixas novas */;
for (const recordId of newRecordIds) {
  enrichRecord(userId, recordId).catch((err) => {
    console.warn('[enrich-immediate]', { recordId, err: err.message });
  });
}
// Note: NÃO aguardamos. Fire-and-forget.
```

Garantia de correção: se a promise pendente for descartada pelo Vercel
(fim da Lambda), o cron do dia seguinte re-avalia — query de
elegibilidade inclui `audioFeaturesSource IS NULL`.

---

## Extensão em `src/lib/queries/status.ts`

Nova função pura (sem side effect) pra alimentar a seção do
`/status`:

```ts
export async function getAudioFeaturesCoverage(userId: number): Promise<{
  totalTracks: number;
  withBpm: { total: number; fromSource: number; fromManual: number };
  withKey: { total: number; fromSource: number; fromManual: number };
  withEnergy: { total: number; fromSource: number; fromManual: number };
  withMoods: { total: number; fromSource: number; fromManual: number };
  lastRun: { startedAt: Date; finishedAt: Date | null; tracksUpdated: number } | null;
}>
```

Consulta agregada em SQL único (1 query). Alvo: <300ms em 3000 discos.

---

## Contrato visual (UI)

### `<AudioFeaturesBadge source={source} />`

Server Component em `src/components/audio-features-badge.tsx`.
Renderiza apenas quando `source === 'acousticbrainz'`. Quando
`source === 'manual'` ou `null`, retorna `null` (nada).

```tsx
// Uso em /disco/[id]/page.tsx, próximo ao bloco de bpm/key/energy:
<AudioFeaturesBadge source={track.audioFeaturesSource} />
```

Design visual: respeita prototype baseline. Opção inicial:

```tsx
<span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute border border-line px-2 py-0.5 rounded-sm">
  sugestão · acousticbrainz
</span>
```

Accessibility: `title` atributo com "Valor sugerido por fonte externa,
não confirmado pelo DJ".
