import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireCurrentUser } from '@/lib/auth';
import {
  getAudioFeaturesCoverage,
  loadStatusSnapshot,
  type AudioFeaturesCoverage,
  type SyncRunRow,
} from '@/lib/queries/status';
import { ConflictRow } from '@/components/conflict-row';
import { ArchivedRecordRow } from '@/components/archived-record-row';
import { ManualSyncButton } from '@/components/manual-sync-button';
import { formatForDisplay } from '@/lib/tz';
import { db } from '@/db';
import { users } from '@/db/schema';

/**
 * Rota `/status` — painel de sincronização (FR-039, FR-040, FR-041).
 * Ao renderizar, marca `users.lastStatusVisitAt=now()` para zerar o badge
 * no header (FR-041).
 */
export default async function StatusPage() {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  // Carrega snapshot ANTES de atualizar lastStatusVisitAt — assim o badge
  // reflete o estado "no momento da visita"; próximos renders não mostram
  // badge até novo evento chegar.
  const [snapshot, audioFeatures] = await Promise.all([
    loadStatusSnapshot(user.id),
    getAudioFeaturesCoverage(user.id),
  ]);

  // Marca visita (FR-041). Feito de forma silenciosa; nenhum revalidate
  // explícito porque a coluna só afeta cálculos futuros do badge.
  await db
    .update(users)
    .set({ lastStatusVisitAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <section className="grid grid-cols-[1fr_auto] items-end gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2">sincronização com Discogs</p>
          <h1 className="title-display text-[44px]">Status</h1>
        </div>
        <ManualSyncButton
          disabled={user.discogsCredentialStatus === 'invalid'}
          initialRunning={snapshot.hasRunningSync}
          reason={
            user.discogsCredentialStatus === 'invalid'
              ? 'Atualize o token em /conta antes de sincronizar'
              : undefined
          }
        />
      </section>

      {/* Conflitos de faixa */}
      {snapshot.trackConflicts.length > 0 ? (
        <section className="mb-12">
          <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
            <h2 className="font-serif italic text-[28px] font-medium tracking-tight">
              Faixas em conflito
            </h2>
            <span className="label-tech text-warn">
              {snapshot.trackConflicts.length}{' '}
              {snapshot.trackConflicts.length === 1 ? 'faixa' : 'faixas'}
            </span>
          </div>
          <p className="font-serif italic text-[15px] text-ink-soft mb-4 max-w-[760px]">
            Estas faixas sumiram do release no Discogs, mas os dados que você
            curou estão preservados. Decida se quer manter no Sulco ou descartar.
          </p>
          <ol>
            {snapshot.trackConflicts.map((c) => (
              <ConflictRow key={c.trackId} conflict={c} />
            ))}
          </ol>
        </section>
      ) : null}

      {/* Discos arquivados pendentes */}
      {snapshot.archivedPending.length > 0 ? (
        <section className="mb-12">
          <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
            <h2 className="font-serif italic text-[28px] font-medium tracking-tight">
              Discos arquivados
            </h2>
            <span className="label-tech text-warn">
              {snapshot.archivedPending.length}{' '}
              {snapshot.archivedPending.length === 1 ? 'pendente' : 'pendentes'}
            </span>
          </div>
          <p className="font-serif italic text-[15px] text-ink-soft mb-4 max-w-[760px]">
            Estes discos saíram da sua coleção Discogs. Toda curadoria está
            preservada. Clique "Reconhecer" para remover do banner após revisar.
          </p>
          <ol>
            {snapshot.archivedPending.map((r) => (
              <ArchivedRecordRow key={r.recordId} record={r} />
            ))}
          </ol>
        </section>
      ) : null}

      {/* 005: Audio features coverage */}
      <AudioFeaturesPanel coverage={audioFeatures} />

      {/* Histórico de syncRuns */}
      <section>
        <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
          <h2 className="font-serif italic text-[28px] font-medium tracking-tight">
            Últimas execuções
          </h2>
          <span className="label-tech">
            {snapshot.runs.length} {snapshot.runs.length === 1 ? 'execução' : 'execuções'}
            {snapshot.runs.length === 20 ? ' (mais antigas ocultas)' : ''}
          </span>
        </div>
        {snapshot.runs.length === 0 ? (
          <p className="font-serif italic text-ink-mute text-center py-10">
            Nenhuma execução de sync registrada ainda.
          </p>
        ) : (
          <ol>
            {snapshot.runs.map((r) => (
              <SyncRunItem key={r.id} run={r} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function SyncRunItem({ run }: { run: SyncRunRow }) {
  const kindLabel = {
    initial_import: 'Import inicial',
    daily_auto: 'Sync automático',
    manual: 'Sync manual',
    reimport_record: 'Reimport de disco',
    audio_features: 'Audio features',
  }[run.kind];

  const outcomeCfg = {
    running: { label: 'Em execução', cls: 'text-ink-mute border-line' },
    ok: { label: 'OK', cls: 'text-ok border-ok' },
    erro: { label: 'Erro', cls: 'text-warn border-warn' },
    rate_limited: { label: 'Rate limit', cls: 'text-warn border-warn' },
    parcial: { label: 'Parcial', cls: 'text-warn border-warn' },
  }[run.outcome];

  return (
    <li className="grid grid-cols-[180px_140px_auto_1fr] gap-4 py-3 border-b border-line-soft items-start">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
        {run.startedAt ? formatForDisplay(run.startedAt) : '—'}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink">
        {kindLabel}
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border rounded-sm self-start ${outcomeCfg.cls}`}
      >
        {outcomeCfg.label}
      </span>
      <div className="min-w-0">
        <p className="font-serif italic text-[14px] text-ink-soft">
          {run.newCount} novos · {run.removedCount} removidos
          {run.conflictCount > 0 ? ` · ${run.conflictCount} conflitos` : ''}
        </p>
        {run.errorMessage ? (
          <p className="font-mono text-[11px] text-warn mt-1 truncate" title={run.errorMessage}>
            {run.errorMessage}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function AudioFeaturesPanel({ coverage }: { coverage: AudioFeaturesCoverage }) {
  const fields: Array<{ label: string; key: 'withBpm' | 'withKey' | 'withEnergy' | 'withMoods' }> = [
    { label: 'BPM', key: 'withBpm' },
    { label: 'Tom', key: 'withKey' },
    { label: 'Energia', key: 'withEnergy' },
    { label: 'Moods', key: 'withMoods' },
  ];

  return (
    <section className="mb-12">
      <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
        <h2 className="font-serif italic text-[28px] font-medium tracking-tight">
          Audio features
        </h2>
        <span className="label-tech">
          {coverage.totalTracks} {coverage.totalTracks === 1 ? 'faixa' : 'faixas'} ativas
        </span>
      </div>

      {coverage.totalTracks === 0 ? (
        <p className="font-serif italic text-ink-mute text-center py-6">
          Nenhuma faixa ativa ainda — audio features aparecem aqui quando houver curadoria.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {fields.map(({ label, key }) => {
            const fc = coverage[key];
            const pct = coverage.totalTracks > 0 ? Math.round((fc.total / coverage.totalTracks) * 100) : 0;
            return (
              <div key={key} className="border border-line rounded-sm p-4">
                <div className="flex justify-between items-baseline mb-2">
                  <h3 className="font-mono text-[12px] uppercase tracking-[0.14em]">{label}</h3>
                  <span className="font-mono text-[11px] text-ink-mute">{pct}%</span>
                </div>
                <p className="font-serif italic text-[15px] text-ink">
                  {fc.total} de {coverage.totalTracks}
                </p>
                <p className="font-mono text-[11px] text-ink-mute mt-1">
                  sugestão: {fc.fromSource} · confirmadas: {fc.fromManual}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {coverage.lastRun ? (
        <div className="font-serif italic text-[14px] text-ink-soft">
          Última execução:{' '}
          <span className="font-mono text-[11px] text-ink-mute">
            {formatForDisplay(coverage.lastRun.startedAt)}
          </span>
          {' · '}
          {coverage.lastRun.tracksUpdated} {coverage.lastRun.tracksUpdated === 1 ? 'faixa atualizada' : 'faixas atualizadas'}
          {coverage.lastRun.outcome !== 'ok' ? ` · outcome: ${coverage.lastRun.outcome}` : ''}
        </div>
      ) : (
        <p className="font-serif italic text-[14px] text-ink-mute">
          Nenhuma execução de enriquecimento registrada ainda.
        </p>
      )}
    </section>
  );
}
