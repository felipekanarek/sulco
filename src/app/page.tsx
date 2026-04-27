import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { getImportProgress } from '@/lib/actions';

// getImportProgress pode disparar after(runInitialImport) para continuar
// imports que pararam em serverless timeout. after() herda o maxDuration
// da rota — declaramos 60 (max Hobby) pra dar fôlego.
export const maxDuration = 60;
import { ImportProgressCard } from '@/components/import-progress';
import { FilterBar, type StatusFilter } from '@/components/filter-bar';
import { RandomCurationButton } from '@/components/random-curation-button';
import { RecordRow } from '@/components/record-card';
import { RecordGridCard } from '@/components/record-grid-card';
import { ViewToggle, type ViewMode } from '@/components/view-toggle';
import type { BombaFilterValue } from '@/components/bomba-filter';
import { runInitialImport } from '@/lib/discogs/import';
import {
  collectionCounts,
  countSelectedTracks,
  listUserGenres,
  listUserStyles,
  queryCollection,
} from '@/lib/queries/collection';

type SearchParams = Promise<{
  status?: string;
  q?: string;
  bomba?: string;
  view?: string;
  genre?: string | string[];
  style?: string | string[];
}>;

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const text = (sp.q ?? '').trim();
  const bomba = parseBomba(sp.bomba);
  const view = parseView(sp.view);
  const genres = parseMultiList(sp.genre);
  const styles = parseMultiList(sp.style);

  const [progress, rows, availableGenres, availableStyles, counts, selectedTotal] =
    await Promise.all([
      getImportProgress(),
      queryCollection({ userId: user.id, status, text, genres, styles, bomba }),
      listUserGenres(user.id),
      listUserStyles(user.id),
      collectionCounts(user.id),
      countSelectedTracks(user.id),
    ]);

  const canResume =
    progress.outcome === 'idle' ||
    progress.outcome === 'rate_limited' ||
    progress.outcome === 'parcial';
  if (canResume && !progress.running) {
    runInitialImport(user.id).catch((err) => {
      console.error('[sulco] runInitialImport (fallback / page) falhou:', err);
    });
  }

  const hasFilters =
    status !== 'all' ||
    text.length > 0 ||
    bomba !== 'any' ||
    genres.length > 0 ||
    styles.length > 0;

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8">
      {/* Head editorial */}
      <section className="flex flex-col md:grid md:grid-cols-[1fr_auto] md:items-end gap-6 md:gap-8 pb-6 border-b border-line mb-6">
        <div>
          <p className="eyebrow mb-2">{user.discogsUsername} · discogs</p>
          <h1 className="title-display text-[34px] md:text-[44px]">Coleção</h1>
        </div>
        <dl className="grid grid-cols-2 md:flex md:gap-10 gap-4 md:items-end">
          <Stat label="Discos" value={counts.total.toLocaleString('pt-BR')} />
          <Stat label="Ativos" value={counts.ativos.toLocaleString('pt-BR')} />
          <Stat label="Não avaliados" value={counts.naoAvaliados.toLocaleString('pt-BR')} />
          <Stat label="Faixas sel." value={selectedTotal.toLocaleString('pt-BR')} />
        </dl>
      </section>

      <ImportProgressCard initial={progress} />

      <FilterBar
        status={status}
        text={text}
        bomba={bomba}
        genres={genres}
        availableGenres={availableGenres}
        styles={styles}
        availableStyles={availableStyles}
        counts={counts}
      />

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between mb-4 pb-2 border-b border-line-soft gap-3 sm:gap-4">
        <p className="label-tech">
          Mostrando {rows.length.toLocaleString('pt-BR')} de {counts.total.toLocaleString('pt-BR')}
          {hasFilters ? ' (filtrado)' : ''}
        </p>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <RandomCurationButton />
          <ViewToggle value={view} />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} importRunning={progress.running} />
      ) : view === 'grade' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
          {rows.map((r) => (
            <RecordGridCard key={r.id} record={r} />
          ))}
        </div>
      ) : (
        <ol className="border-t border-line">
          {rows.map((r) => (
            <RecordRow key={r.id} record={r} />
          ))}
        </ol>
      )}

      <div className="flex justify-between items-center pt-6 mt-4">
        <p className="label-tech">
          {rows.length.toLocaleString('pt-BR')} de {counts.total.toLocaleString('pt-BR')}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-tech mb-1">{label}</dt>
      <dd className="font-serif text-[22px] font-medium tracking-tight leading-none">{value}</dd>
    </div>
  );
}

function EmptyState({
  hasFilters,
  importRunning,
}: {
  hasFilters: boolean;
  importRunning: boolean;
}) {
  if (importRunning) {
    return (
      <div className="border border-dashed border-line p-10 text-center">
        <p className="eyebrow">Importando</p>
        <p className="font-serif italic text-xl mt-2">
          A coleção aparece aqui conforme o Discogs responde.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-dashed border-line p-10 text-center">
      <p className="eyebrow">Vazio</p>
      <p className="font-serif italic text-xl mt-2">
        {hasFilters
          ? 'Nenhum disco encontrado com esses filtros.'
          : 'Sua coleção ainda está vazia. Verifique o /status se o import terminou com erro.'}
      </p>
    </div>
  );
}

function parseStatus(v: string | undefined): StatusFilter {
  if (v === 'unrated' || v === 'active' || v === 'discarded' || v === 'all') return v;
  return 'all';
}
function parseBomba(v: string | undefined): BombaFilterValue {
  if (v === 'only' || v === 'none') return v;
  return 'any';
}
function parseView(v: string | undefined): ViewMode {
  if (v === 'grade' || v === 'lista') return v;
  return 'lista';
}
function parseMultiList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}
