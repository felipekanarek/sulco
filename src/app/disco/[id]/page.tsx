import { db, records, tracks } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { toggleTrackSelected, updateTrack, updateRecordStatus, setTrackRating, toggleRecordCurated } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function DiscoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (!Number.isFinite(recordId)) notFound();

  const [record] = await db.select().from(records).where(eq(records.id, recordId));
  if (!record) notFound();

  const trackList = await db.select().from(tracks)
    .where(eq(tracks.recordId, recordId))
    .orderBy(asc(tracks.position));

  // Agrupar por lado (letra inicial da posição)
  const bySide = new Map<string, typeof trackList>();
  for (const t of trackList) {
    const side = t.position.charAt(0).toUpperCase();
    if (!bySide.has(side)) bySide.set(side, []);
    bySide.get(side)!.push(t);
  }

  const total = trackList.length;
  const curated = trackList.filter((t) => t.bpm || t.energy || (t.moods && t.moods.length)).length;
  const selected = trackList.filter((t) => t.selected).length;

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      {/* Head */}
      <section className="flex items-end justify-between gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2">
            <Link href="/" className="hover:text-ink">← Coleção</Link> · disco {record.id}
          </p>
          <h1 className="title-display text-[36px]">Em discoteca</h1>
        </div>
      </section>

      <div className="grid grid-cols-[380px_1fr] gap-16 items-start">
        {/* Coluna esquerda: disco */}
        <aside className="sticky top-28">
          <div className="cover w-full aspect-square mb-6" />

          <p className="label-tech mb-2">{record.artist}</p>
          <h2 className="font-serif italic text-[40px] font-normal tracking-tight leading-none mb-5">
            {record.title}
          </h2>

          <dl className="font-mono text-[13px] text-ink-mute tracking-wide py-4 border-t border-b border-line mb-6 leading-loose">
            <MetaRow label="Selo" value={record.label} />
            <MetaRow label="Ano" value={record.year?.toString()} />
            <MetaRow label="Formato" value={record.format} />
            <MetaRow label="País" value={record.country} />
            <MetaRow label="Gêneros" value={(record.genres ?? []).join(', ')} />
            <MetaRow label="Estilos" value={(record.styles ?? []).join(', ')} />
            {record.shelfLocation && <MetaRow label="Prateleira" value={record.shelfLocation} />}
          </dl>

          <CuratedControl recordId={record.id} curated={record.curated} curatedAt={record.curatedAt} />

          <StatusControls recordId={record.id} currentStatus={record.status} />

          <a
            href={`https://www.discogs.com/release/${record.discogsId}`}
            target="_blank"
            rel="noreferrer"
            className="block font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft hover:text-accent py-2 mt-4"
          >
            → Ver no Discogs
          </a>
        </aside>

        {/* Coluna direita: tracklist */}
        <section className="min-w-0">
          <div className="flex justify-between items-baseline pb-4 border-b border-line mb-6">
            <span className="eyebrow">Tracklist · {total} faixas</span>
            <span className="font-serif italic text-[16px] text-ink-soft">
              {curated} curadas · {selected} selecionadas
            </span>
          </div>

          {[...bySide.entries()].map(([side, items]) => (
            <div key={side} className="mb-10">
              <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-accent mb-3 pb-2 border-b border-accent-soft">
                Lado {side}
              </p>
              {items.map((t) => (
                <TrackRow key={t.id} track={t} recordId={record.id} />
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="inline">{label} · </dt>
      <dd className="inline text-ink m-0">{value}</dd>
    </div>
  );
}

function CuratedControl({
  recordId,
  curated,
  curatedAt,
}: {
  recordId: number;
  curated: boolean;
  curatedAt: Date | null;
}) {
  async function toggle() {
    'use server';
    await toggleRecordCurated(recordId);
    if (!curated) redirect('/?curated=yes');
  }
  const stamp = curatedAt ? new Date(curatedAt).toLocaleDateString('pt-BR') : null;
  return (
    <form action={toggle} className="mb-4">
      <button
        type="submit"
        className={`w-full font-mono text-[11px] uppercase tracking-[0.12em] px-4 py-3 rounded-sm border transition-colors text-left flex items-center justify-between ${
          curated
            ? 'bg-ok text-paper border-ok'
            : 'border-line text-ink hover:border-ink'
        }`}
      >
        <span>{curated ? 'Curado' : 'Marcar como curado'}</span>
        <span className="opacity-70">{curated ? (stamp ? `· ${stamp}` : '') : '→'}</span>
      </button>
    </form>
  );
}

function StatusControls({
  recordId,
  currentStatus,
}: {
  recordId: number;
  currentStatus: string;
}) {
  async function setStatus(formData: FormData) {
    'use server';
    const s = formData.get('status') as 'active' | 'unrated' | 'discarded';
    await updateRecordStatus(recordId, s);
  }
  return (
    <form action={setStatus} className="flex flex-col gap-2">
      {(['active', 'unrated', 'discarded'] as const).map((s) => (
        <button
          key={s}
          type="submit"
          name="status"
          value={s}
          className={`font-mono text-[11px] uppercase tracking-[0.12em] px-4 py-3 rounded-sm border transition-colors text-left ${
            currentStatus === s
              ? 'bg-ink text-paper border-ink'
              : 'border-line text-ink hover:border-ink'
          }`}
        >
          {s === 'active' && 'Ativo para discotecar'}
          {s === 'unrated' && 'Não avaliado'}
          {s === 'discarded' && 'Descartar'}
        </button>
      ))}
    </form>
  );
}

function TrackRow({
  track,
  recordId,
}: {
  track: {
    id: number;
    position: string;
    title: string;
    selected: boolean;
    rating: number | null;
    bpm: number | null;
    musicalKey: string | null;
    energy: number | null;
    moods: string[] | null;
    contexts: string[] | null;
    fineGenre: string | null;
    references: string | null;
    comment: string | null;
  };
  recordId: number;
}) {
  const toggleAction = async () => {
    'use server';
    await toggleTrackSelected(track.id, recordId);
  };
  const updateAction = async (formData: FormData) => {
    'use server';
    await updateTrack(track.id, recordId, formData);
  };
  const rateAction = async (formData: FormData) => {
    'use server';
    const raw = formData.get('rating');
    const next = raw === null || raw === '' ? null : Number(raw);
    await setTrackRating(track.id, recordId, next === track.rating ? null : next);
  };

  return (
    <article
      className={`grid grid-cols-[36px_1fr_auto] gap-4 py-4 border-b border-line-soft items-start ${
        track.selected ? '' : ''
      }`}
    >
      <span className={`font-mono text-[13px] tracking-wide pt-1 ${track.selected ? 'text-accent font-medium' : 'text-ink-mute'}`}>
        {track.position}
      </span>

      <div className="min-w-0">
        <h3 className="font-serif italic text-[19px] leading-tight mb-2">{track.title}</h3>

        <RatingControl rating={track.rating} action={rateAction} />

        {(track.bpm || track.musicalKey || track.energy || (track.moods && track.moods.length)) && (
          <div className="flex gap-2 flex-wrap mb-2">
            {track.bpm && <Tag>{track.bpm} BPM</Tag>}
            {track.musicalKey && <Tag>{track.musicalKey}</Tag>}
            {track.energy && <Tag>energia {track.energy}</Tag>}
            {track.fineGenre && <Tag variant="ink">{track.fineGenre}</Tag>}
            {(track.moods ?? []).map((m) => (
              <Tag key={m} variant="mood">{m}</Tag>
            ))}
            {(track.contexts ?? []).map((c) => (
              <Tag key={c} variant="ctx">{c}</Tag>
            ))}
          </div>
        )}

        {track.comment && (
          <p className="font-serif italic text-[16px] text-ink-soft leading-relaxed pl-3 border-l-2 border-line mt-2">
            {track.comment}
          </p>
        )}
        {track.references && (
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute mt-2">
            ref · {track.references}
          </p>
        )}

        {/* Edit form - always visible, submits on blur */}
        <details className="mt-3">
          <summary className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute cursor-pointer hover:text-accent">
            editar curadoria
          </summary>
          <form action={updateAction} className="grid grid-cols-4 gap-4 mt-3 p-4 bg-paper-raised border border-line-soft rounded-sm">
            <Field label="Avaliação 1-3 (+ ++ +++)" name="rating" defaultValue={track.rating?.toString()} />
            <Field label="BPM" name="bpm" defaultValue={track.bpm?.toString()} />
            <Field label="Tom" name="musicalKey" defaultValue={track.musicalKey ?? ''} />
            <Field label="Energia 1-5" name="energy" defaultValue={track.energy?.toString()} />
            <Field label="Gênero fino" name="fineGenre" defaultValue={track.fineGenre ?? ''} />
            <Field label="Moods (vírgula)" name="moods" defaultValue={(track.moods ?? []).join(', ')} colSpan={2} />
            <Field label="Contextos (vírgula)" name="contexts" defaultValue={(track.contexts ?? []).join(', ')} colSpan={2} />
            <Field label="Comentário" name="comment" defaultValue={track.comment ?? ''} colSpan={4} />
            <Field label="Referências" name="references" defaultValue={track.references ?? ''} colSpan={4} />
            <button
              type="submit"
              className="col-span-4 font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper py-2 rounded-sm hover:bg-accent"
            >
              Salvar curadoria
            </button>
          </form>
        </details>
      </div>

      <form action={toggleAction}>
        <button
          type="submit"
          className={`font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-2 rounded-sm border min-w-[44px] ${
            track.selected ? 'bg-ink text-paper border-ink' : 'text-ink-mute border-line hover:border-ink'
          }`}
        >
          {track.selected ? 'on' : 'off'}
        </button>
      </form>
    </article>
  );
}

function RatingControl({
  rating,
  action,
}: {
  rating: number | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const labels: Record<number, { glyph: string; hint: string }> = {
    1: { glyph: '+', hint: 'boa, mas nem tanto' },
    2: { glyph: '++', hint: 'boa' },
    3: { glyph: '+++', hint: 'muito boa para tocar' },
  };
  return (
    <form action={action} className="flex items-center gap-1 mb-2">
      {[1, 2, 3].map((n) => {
        const active = rating === n;
        return (
          <button
            key={n}
            type="submit"
            name="rating"
            value={n}
            title={labels[n].hint}
            aria-label={`Avaliar ${labels[n].glyph} — ${labels[n].hint}`}
            className={`font-mono text-[12px] tracking-tight px-2 py-1 border rounded-sm min-w-[40px] transition-colors ${
              active
                ? 'bg-accent text-paper border-accent'
                : 'text-ink-mute border-line hover:border-ink hover:text-ink'
            }`}
          >
            {labels[n].glyph}
          </button>
        );
      })}
      {rating !== null && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute ml-2">
          {labels[rating]?.hint}
          <span className="text-ink-mute"> · clique de novo p/ limpar</span>
        </span>
      )}
    </form>
  );
}

function Tag({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: 'mood' | 'ctx' | 'ink';
}) {
  const cls = {
    mood: 'text-accent border-accent-soft',
    ctx: 'text-ok border-ok',
    ink: 'text-ink border-ink',
    default: 'text-ink-soft border-line',
  }[variant ?? 'default'];
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border rounded-sm bg-paper ${cls}`}>
      {children}
    </span>
  );
}

function Field({
  label,
  name,
  defaultValue,
  colSpan,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  colSpan?: number;
}) {
  return (
    <div style={colSpan ? { gridColumn: `span ${colSpan}` } : undefined}>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute mb-1 block">
        {label}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        className="w-full font-serif text-[16px] bg-transparent border-0 border-b border-ink pb-1 outline-none focus:border-accent"
      />
    </div>
  );
}
