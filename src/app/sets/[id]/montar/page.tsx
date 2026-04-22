import Link from 'next/link';
import { db, sets, setTracks, tracks, records } from '@/db';
import { eq, and, gte, lte, asc, desc, sql, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { addTrackToSet, removeTrackFromSet } from '@/lib/actions';

export const dynamic = 'force-dynamic';

type SP = {
  bpmMin?: string;
  bpmMax?: string;
  energy?: string;
  mood?: string;
  context?: string;
  rating?: string;
  q?: string;
};

const RATING_GLYPH: Record<number, string> = { 1: '+', 2: '++', 3: '+++' };

export default async function MontarSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const setId = parseInt(id, 10);
  if (!Number.isFinite(setId)) notFound();

  const [set] = await db.select().from(sets).where(eq(sets.id, setId));
  if (!set) notFound();

  // Faixas já no set
  const inSetRows = await db
    .select({ trackId: setTracks.trackId })
    .from(setTracks)
    .where(eq(setTracks.setId, setId));
  const inSetIds = new Set(inSetRows.map((r) => r.trackId));

  // Faixas do set com detalhes (para o painel direito)
  const setTracksList = await db
    .select({
      trackId: tracks.id,
      position: tracks.position,
      title: tracks.title,
      bpm: tracks.bpm,
      rating: tracks.rating,
      artist: records.artist,
      recordId: records.id,
      recordTitle: records.title,
      shelfLocation: records.shelfLocation,
      order: setTracks.order,
    })
    .from(setTracks)
    .innerJoin(tracks, eq(tracks.id, setTracks.trackId))
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(eq(setTracks.setId, setId))
    .orderBy(asc(setTracks.order));

  const uniqueRecordsInSet = new Set(setTracksList.map((t) => t.recordId));

  // Buscar candidatos: apenas faixas selecionadas de discos ativos
  const conditions = [eq(tracks.selected, true), eq(records.status, 'active')];

  if (sp.bpmMin) conditions.push(gte(tracks.bpm, parseInt(sp.bpmMin, 10)));
  if (sp.bpmMax) conditions.push(lte(tracks.bpm, parseInt(sp.bpmMax, 10)));
  if (sp.energy && sp.energy !== 'any') conditions.push(eq(tracks.energy, parseInt(sp.energy, 10)));
  if (sp.rating && sp.rating !== 'any') conditions.push(gte(tracks.rating, parseInt(sp.rating, 10)));

  let candidates = await db
    .select({
      id: tracks.id,
      position: tracks.position,
      title: tracks.title,
      bpm: tracks.bpm,
      musicalKey: tracks.musicalKey,
      energy: tracks.energy,
      rating: tracks.rating,
      moods: tracks.moods,
      contexts: tracks.contexts,
      fineGenre: tracks.fineGenre,
      comment: tracks.comment,
      artist: records.artist,
      recordId: records.id,
      recordTitle: records.title,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(...conditions))
    .orderBy(desc(tracks.rating), asc(records.artist))
    .limit(200);

  // Filtros em memória (moods, contexts, query livre)
  if (sp.mood && sp.mood !== 'any') {
    candidates = candidates.filter((c) => (c.moods ?? []).includes(sp.mood!));
  }
  if (sp.context && sp.context !== 'any') {
    candidates = candidates.filter((c) => (c.contexts ?? []).includes(sp.context!));
  }
  if (sp.q) {
    const q = sp.q.toLowerCase();
    candidates = candidates.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.artist.toLowerCase().includes(q) ||
        (c.fineGenre ?? '').toLowerCase().includes(q) ||
        (c.comment ?? '').toLowerCase().includes(q),
    );
  }

  // Listas de opções únicas (para popular selects)
  const allMoods = new Set<string>();
  const allContexts = new Set<string>();
  const all = await db
    .select({ moods: tracks.moods, contexts: tracks.contexts })
    .from(tracks);
  for (const r of all) {
    (r.moods ?? []).forEach((m) => allMoods.add(m));
    (r.contexts ?? []).forEach((c) => allContexts.add(c));
  }

  const qs = (next: Partial<SP>): string => {
    const merged: Record<string, string | undefined> = { ...sp, ...next };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) u.set(k, v);
    }
    const s = u.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="max-w-[1440px] mx-auto px-8">
      <section className="grid grid-cols-[1fr_auto] items-end gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2">
            <Link href={`/sets/${set.id}`} className="hover:text-ink">← {set.name}</Link> · montar
          </p>
          <h1 className="title-display text-[32px]">{set.name}</h1>
        </div>
        <Link
          href={`/sets/${set.id}`}
          className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-5 py-3 rounded-sm hover:bg-accent"
        >
          Finalizar →
        </Link>
      </section>

      <div className="grid grid-cols-[1fr_400px] gap-12 items-start">
        {/* Esquerda: filtros + candidatos */}
        <div className="flex flex-col gap-8">
          {/* Painel de briefing (read-only nesta tela) */}
          {set.briefing && (
            <section className="border border-line bg-paper-raised p-6 rounded-sm">
              <p className="eyebrow text-accent mb-3">01 · briefing</p>
              <p className="font-serif italic text-[19px] text-ink-soft leading-relaxed">
                {set.briefing}
              </p>
            </section>
          )}

          {/* Painel de filtros */}
          <section className="border border-line bg-paper-raised p-6 rounded-sm">
            <div className="flex justify-between items-baseline mb-6 pb-3 border-b border-line-soft">
              <div>
                <p className="eyebrow text-accent">02 · filtros</p>
                <h2 className="font-serif italic text-[22px] font-medium">Busca precisa</h2>
              </div>
              <Link href={`/sets/${setId}/montar`} className="label-tech hover:text-accent">
                limpar
              </Link>
            </div>

            <form method="GET" className="grid grid-cols-3 gap-4">
              <FilterSelect label="Avaliação mínima" name="rating" defaultValue={sp.rating} options={[
                { value: 'any', label: 'qualquer' },
                { value: '3', label: '+++ muito boa' },
                { value: '2', label: '++ boa ou melhor' },
                { value: '1', label: '+ ou melhor' },
              ]} />
              <FilterInput label="BPM de" name="bpmMin" type="number" defaultValue={sp.bpmMin} />
              <FilterInput label="BPM até" name="bpmMax" type="number" defaultValue={sp.bpmMax} />
              <FilterSelect label="Energia" name="energy" defaultValue={sp.energy} options={[
                { value: 'any', label: 'qualquer' },
                { value: '1', label: '1 — contemplativo' },
                { value: '2', label: '2 — sutil' },
                { value: '3', label: '3 — moderado' },
                { value: '4', label: '4 — alto' },
                { value: '5', label: '5 — pico' },
              ]} />
              <FilterSelect label="Mood" name="mood" defaultValue={sp.mood} options={[
                { value: 'any', label: 'qualquer' },
                ...[...allMoods].sort().map((m) => ({ value: m, label: m })),
              ]} />
              <FilterSelect label="Contexto" name="context" defaultValue={sp.context} options={[
                { value: 'any', label: 'qualquer' },
                ...[...allContexts].sort().map((c) => ({ value: c, label: c })),
              ]} />
              <FilterInput label="Busca livre" name="q" type="text" defaultValue={sp.q} placeholder="título, gênero, ref…" />
              <div className="col-span-3 flex justify-end pt-2">
                <button type="submit" className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-6 py-3 rounded-sm hover:bg-accent">
                  Aplicar filtros
                </button>
              </div>
            </form>
          </section>

          {/* Candidatos */}
          <section>
            <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
              <h2 className="font-serif italic text-[28px] font-medium tracking-tight">
                Candidatos
              </h2>
              <span className="label-tech">{candidates.length} faixas selecionadas + ativas</span>
            </div>

            {candidates.length === 0 ? (
              <p className="font-serif italic text-ink-mute text-center py-12">
                Nenhuma faixa encontrada com esses filtros.
              </p>
            ) : (
              <ol>
                {candidates.map((c) => {
                  const alreadyIn = inSetIds.has(c.id);
                  const addAction = async () => {
                    'use server';
                    await addTrackToSet(setId, c.id);
                  };
                  return (
                    <li
                      key={c.id}
                      className={`grid grid-cols-[48px_auto_56px_1fr_auto_auto] gap-4 py-4 border-b border-line-soft items-center ${
                        alreadyIn ? 'opacity-50' : ''
                      }`}
                    >
                      <Link href={`/disco/${c.recordId}`} className="cover w-12 h-12 block" aria-hidden />
                      <span className="font-mono text-[13px] text-accent font-medium px-2 py-1 border border-accent-soft rounded-sm">
                        {c.position}
                      </span>
                      <RatingGlyph rating={c.rating} />
                      <div className="min-w-0">
                        <p className="font-serif italic text-[19px] leading-tight">{c.title}</p>
                        <p className="label-tech">
                          {c.artist} · <span className="text-ink-soft">{c.recordTitle}</span>
                        </p>
                        {(c.moods?.length || c.contexts?.length) && (
                          <p className="font-serif italic text-[13px] text-ink-soft mt-1">
                            {[...(c.moods ?? []), ...(c.contexts ?? [])].slice(0, 4).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="label-tech text-right pr-2">
                        {c.bpm && <span>{c.bpm} BPM</span>}
                        {c.musicalKey && <span> · {c.musicalKey}</span>}
                        {c.energy && <div>energia {c.energy}</div>}
                      </div>
                      <form action={addAction}>
                        <button
                          type="submit"
                          disabled={alreadyIn}
                          className="w-10 h-10 rounded-full border border-line hover:bg-ink hover:text-paper hover:border-ink font-serif text-[22px] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-mute"
                        >
                          {alreadyIn ? '✓' : '+'}
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Direita: set em construção */}
        <aside className="sticky top-28 border border-ink p-6 bg-paper-raised rounded-sm">
          <div className="border-b border-ink pb-4 mb-5">
            <p className="eyebrow text-accent mb-2">Set em construção</p>
            <h2 className="font-serif italic text-[26px] font-medium tracking-tight leading-tight">
              {set.name}
            </h2>
          </div>

          <div className="bg-ink text-paper p-4 rounded-sm mb-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-soft mb-2">
              Bag física
            </p>
            <p className="font-serif italic text-[40px] font-normal leading-none">
              {uniqueRecordsInSet.size}
            </p>
            <p className="font-serif italic text-[13px] opacity-70 mt-2">
              {setTracksList.length} faixas · {uniqueRecordsInSet.size} discos
            </p>
          </div>

          {setTracksList.length === 0 ? (
            <p className="font-serif italic text-ink-mute text-[14px] py-8 text-center">
              Adicione faixas dos candidatos ao lado →
            </p>
          ) : (
            <ul className="max-h-[500px] overflow-y-auto">
              {setTracksList.map((t) => {
                const removeAction = async () => {
                  'use server';
                  await removeTrackFromSet(setId, t.trackId);
                };
                return (
                  <li key={t.trackId} className="grid grid-cols-[36px_40px_1fr_auto] gap-3 py-3 border-b border-line-soft items-center">
                    <span className="font-mono text-[13px] text-accent font-medium">{t.position}</span>
                    <RatingGlyph rating={t.rating} compact />
                    <div className="min-w-0">
                      <p className="font-serif italic text-[15px] leading-tight truncate">{t.title}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute truncate">
                        {t.artist}
                      </p>
                    </div>
                    <form action={removeAction}>
                      <button type="submit" className="text-ink-mute hover:text-accent">×</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function RatingGlyph({ rating, compact }: { rating: number | null; compact?: boolean }) {
  if (!rating) {
    return (
      <span
        className={`font-mono ${compact ? 'text-[11px]' : 'text-[13px]'} text-ink-mute text-center`}
        title="sem avaliação"
      >
        —
      </span>
    );
  }
  const hint = rating === 3 ? 'muito boa para tocar' : rating === 2 ? 'boa' : 'boa, mas nem tanto';
  return (
    <span
      title={hint}
      className={`font-mono font-semibold text-accent text-center tracking-tight ${
        compact ? 'text-[13px]' : 'text-[18px]'
      }`}
    >
      {RATING_GLYPH[rating]}
    </span>
  );
}

function FilterInput({
  label,
  name,
  type,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="font-serif text-[16px] bg-paper border border-line px-3 py-2 rounded-sm outline-none focus:border-ink"
      />
    </div>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="font-serif text-[16px] bg-paper border border-line px-3 py-2 rounded-sm outline-none focus:border-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
