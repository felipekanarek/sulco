import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { loadSet } from '@/lib/queries/sets';
import {
  listSelectedVocab,
  listSetTracks,
  queryCandidates,
  type BombaFilter,
  type MontarFilters,
} from '@/lib/queries/montar';
import { MontarFiltersForm } from '@/components/montar-filters';
import { CandidateRow } from '@/components/candidate-row';
import { SetSidePanel } from '@/components/set-side-panel';

type SearchParams = Promise<{
  bpmMin?: string;
  bpmMax?: string;
  energyMin?: string;
  energyMax?: string;
  ratingMin?: string;
  ratingMax?: string;
  key?: string | string[];
  mood?: string | string[];
  context?: string | string[];
  bomba?: string;
  q?: string;
}>;

export default async function MontarSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const { id } = await params;
  const setId = Number(id);
  if (!Number.isFinite(setId)) notFound();

  const set = await loadSet(user.id, setId);
  if (!set) notFound();

  // Filtros: prioridade searchParams > persistidos em sets.montarFiltersJson
  const sp = await searchParams;
  const filtersFromUrl = parseFiltersFromSearchParams(sp);
  const hasUrlFilters = Object.keys(filtersFromUrl).length > 0;
  let storedFilters: MontarFilters = {};
  if (!hasUrlFilters && set.montarFiltersJson && set.montarFiltersJson !== '{}') {
    try {
      storedFilters = JSON.parse(set.montarFiltersJson) as MontarFilters;
    } catch {
      storedFilters = {};
    }
  }
  const filters: MontarFilters = hasUrlFilters ? filtersFromUrl : storedFilters;

  const inSetTracks = await listSetTracks(setId, user.id);
  const inSetIds = new Set(inSetTracks.map((t) => t.trackId));

  // 003 FR-014a: faixas já na bag NÃO são excluídas da lista de
  // candidatos. Elas seguem visíveis, marcadas via `alreadyIn` prop,
  // pra DJ manter contexto (avaliar outras do mesmo disco etc.).
  const [candidates, moodSuggestions, contextSuggestions] = await Promise.all([
    queryCandidates(user.id, filters),
    listSelectedVocab(user.id, 'moods'),
    listSelectedVocab(user.id, 'contexts'),
  ]);

  const uniqueRecords = new Set(inSetTracks.map((t) => t.recordId)).size;
  const atLimit = inSetTracks.length >= 300;

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8">
      <section className="flex flex-col md:grid md:grid-cols-[1fr_auto] md:items-end gap-3 md:gap-8 pb-4 md:pb-6 border-b border-line mb-6 md:mb-8">
        <div>
          <p className="eyebrow mb-2">
            <Link href={`/sets/${set.id}`} className="hover:text-ink transition-colors">
              ← {set.name}
            </Link>{' '}
            · montar
          </p>
          <h1 className="title-display text-[26px] md:text-[32px]">{set.name}</h1>
        </div>
        <Link
          href={`/sets/${set.id}`}
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 min-h-[44px] inline-flex items-center justify-center rounded-sm hover:bg-accent transition-colors self-start md:self-auto"
        >
          Finalizar →
        </Link>
      </section>

      <div className="flex flex-col md:grid md:grid-cols-[1fr_400px] gap-6 md:gap-12 md:items-start">
        {/* Esquerda: briefing + filtros + candidatos.
            Mobile: order-2 (vai depois do SetSidePanel pra bag aparecer no topo).
            Desktop: order natural — fica na coluna 1 do grid. */}
        <div className="order-2 md:order-none flex flex-col gap-6 md:gap-8">
          {set.briefing ? (
            <section className="border border-line bg-paper-raised p-4 md:p-6 rounded-sm">
              <p className="eyebrow text-accent mb-3">01 · briefing</p>
              <p className="font-serif italic text-[16px] md:text-[19px] text-ink-soft leading-relaxed whitespace-pre-wrap">
                {set.briefing}
              </p>
            </section>
          ) : null}

          {/* Mobile: filtros colapsáveis em <details>; Desktop: inline expandido */}
          <details className="md:hidden border border-line bg-paper-raised rounded-sm">
            <summary className="cursor-pointer px-4 py-3 min-h-[48px] flex items-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink hover:text-accent">
              Filtros · clique para expandir
            </summary>
            <div className="border-t border-line-soft">
              <MontarFiltersForm
                setId={setId}
                initial={filters}
                moodSuggestions={moodSuggestions}
                contextSuggestions={contextSuggestions}
              />
            </div>
          </details>
          <div className="hidden md:block">
            <MontarFiltersForm
              setId={setId}
              initial={filters}
              moodSuggestions={moodSuggestions}
              contextSuggestions={contextSuggestions}
            />
          </div>

          <section>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline pb-3 md:pb-4 border-b border-line mb-4 md:mb-6 gap-1">
              <h2 className="font-serif italic text-[24px] md:text-[28px] font-medium tracking-tight">
                Candidatos
              </h2>
              <span className="label-tech">
                {candidates.length} {candidates.length === 1 ? 'faixa' : 'faixas'} ·
                selecionadas + ativas
              </span>
            </div>

            {atLimit ? (
              <div className="border border-warn/40 bg-warn/5 p-4 rounded-sm mb-6">
                <p className="font-serif italic text-ink-soft">
                  Você atingiu o limite de <strong>300 faixas por set</strong>. Remova alguma
                  faixa à direita para continuar adicionando.
                </p>
              </div>
            ) : null}

            {candidates.length === 0 ? (
              <p className="font-serif italic text-ink-mute text-center py-12">
                Nenhuma faixa encontrada com esses filtros.
              </p>
            ) : (
              <ol>
                {candidates.map((c) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    setId={setId}
                    alreadyIn={inSetIds.has(c.id)}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Direita desktop / topo mobile: set em construção (bag).
            order-1 mobile pra ficar no topo; em desktop fica na col 2 do grid. */}
        <div className="order-1 md:order-none">
          <SetSidePanel
            setId={setId}
            setName={set.name}
            uniqueRecords={uniqueRecords}
            tracks={inSetTracks.map((t) => ({
              trackId: t.trackId,
              position: t.position,
              title: t.title,
              rating: t.rating,
              artist: t.artist,
              recordId: t.recordId,
              isBomb: t.isBomb,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function parseFiltersFromSearchParams(sp: Awaited<SearchParams>): MontarFilters {
  const f: MontarFilters = {};

  const bpmMin = parseIntOr(sp.bpmMin);
  const bpmMax = parseIntOr(sp.bpmMax);
  if (bpmMin != null || bpmMax != null) f.bpm = { min: bpmMin ?? undefined, max: bpmMax ?? undefined };

  const energyMin = parseIntOr(sp.energyMin);
  const energyMax = parseIntOr(sp.energyMax);
  if (energyMin != null || energyMax != null)
    f.energy = { min: energyMin ?? undefined, max: energyMax ?? undefined };

  const ratingMin = parseIntOr(sp.ratingMin);
  const ratingMax = parseIntOr(sp.ratingMax);
  if (ratingMin != null || ratingMax != null)
    f.rating = { min: ratingMin ?? undefined, max: ratingMax ?? undefined };

  const keys = parseMulti(sp.key);
  if (keys.length > 0) f.musicalKey = keys;

  const moods = parseMulti(sp.mood);
  if (moods.length > 0) f.moods = moods;

  const contexts = parseMulti(sp.context);
  if (contexts.length > 0) f.contexts = contexts;

  if (sp.bomba === 'only' || sp.bomba === 'none') f.bomba = sp.bomba as BombaFilter;

  if (sp.q && sp.q.trim().length > 0) f.text = sp.q.trim();

  return f;
}

function parseIntOr(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseMulti(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}
