import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { listUserVocabulary } from '@/lib/actions';
import { getUserAIConfigStatus } from '@/lib/ai';
import { loadDisc } from '@/lib/queries/curadoria';
import { CoverPlaceholder } from '@/components/cover-placeholder';
import { EnrichRecordButton } from '@/components/enrich-record-button';
import { RecordControls } from '@/components/record-controls';
import { ReimportButton } from '@/components/reimport-button';
import { TrackCurationRow } from '@/components/track-curation-row';
import { db } from '@/db';
import { records as recordsTable } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isFinite(recordId)) notFound();

  const disc = await loadDisc(user.id, recordId);
  if (!disc) notFound();

  // Notes/shelfLocation vêm do records direto (CuradoriaDisc não carrega essas colunas)
  const full = await db
    .select()
    .from(recordsTable)
    .where(and(eq(recordsTable.id, recordId), eq(recordsTable.userId, user.id)))
    .limit(1);
  const record = full[0]!;

  const [moodSuggestions, contextSuggestions, aiStatus] = await Promise.all([
    listUserVocabulary('moods'),
    listUserVocabulary('contexts'),
    getUserAIConfigStatus(user.id),
  ]);
  const aiConfigured = aiStatus.configured;

  // Agrupar faixas por lado (letra inicial da posição)
  const bySide = new Map<string, typeof disc.tracks>();
  for (const t of disc.tracks) {
    const side = (t.position.match(/^[A-Za-z]+/)?.[0] ?? '—').toUpperCase();
    if (!bySide.has(side)) bySide.set(side, []);
    bySide.get(side)!.push(t);
  }

  const selectedCount = disc.tracks.filter((t) => t.selected).length;
  const bombCount = disc.tracks.filter((t) => t.isBomb).length;

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8">
      {/* Head */}
      <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-8 pb-4 md:pb-6 border-b border-line mb-6 md:mb-8">
        <div>
          <p className="eyebrow mb-2">
            <Link href="/" className="hover:text-ink transition-colors">
              ← Coleção
            </Link>{' '}
            · disco {disc.id}
          </p>
          <h1 className="title-display text-[28px] md:text-[36px]">Em discoteca</h1>
        </div>
        <Link
          href="/"
          className="hidden md:inline-flex font-mono text-[11px] uppercase tracking-[0.14em] bg-ink text-paper px-6 py-3 min-h-[44px] items-center justify-center rounded-sm hover:bg-accent transition-colors whitespace-nowrap"
        >
          ✓ Concluir e voltar à coleção
        </Link>
      </section>

      <div className="flex flex-col md:grid md:grid-cols-[380px_1fr] gap-6 md:gap-16 md:items-start">
        {/* Capa + metadados + controles. Mobile: stack vertical full-width.
            Desktop: sidebar 380px sticky. */}
        <aside className="md:sticky md:top-28">
          <div className="cover w-full aspect-square mb-4 md:mb-6 relative overflow-hidden border border-line bg-paper-raised">
            {disc.coverUrl ? (
              <Image
                src={disc.coverUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 380px"
                unoptimized
                className="object-cover"
              />
            ) : (
              <CoverPlaceholder artist={disc.artist} />
            )}
          </div>

          <p className="label-tech mb-2">{disc.artist}</p>
          <h2 className="font-serif italic text-[30px] md:text-[40px] font-normal tracking-tight leading-none mb-4 md:mb-5">
            {disc.title}
          </h2>

          <dl className="font-mono text-[12px] md:text-[13px] text-ink-mute tracking-wide py-3 md:py-4 border-t border-b border-line mb-4 md:mb-6 leading-loose">
            <MetaRow label="Selo" value={disc.label} />
            <MetaRow label="Ano" value={disc.year?.toString()} />
            <MetaRow label="Formato" value={disc.format} />
            <MetaRow label="País" value={disc.country} />
            <MetaRow label="Gêneros" value={disc.genres.join(', ') || null} />
            <MetaRow label="Estilos" value={disc.styles.join(', ') || null} />
          </dl>

          <RecordControls
            recordId={disc.id}
            status={record.status}
            shelfLocation={record.shelfLocation}
            notes={record.notes}
          />

          <div className="mt-4 pt-4 border-t border-line-soft space-y-3">
            <EnrichRecordButton
              recordId={disc.id}
              alreadyAttempted={disc.tracks.some((t) => t.audioFeaturesSource !== null)}
            />
            <ReimportButton recordId={disc.id} variant="default" />
            <div className="flex flex-col gap-1">
              <a
                href={`https://www.discogs.com/release/${record.discogsId}`}
                target="_blank"
                rel="noreferrer"
                className="block font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft hover:text-accent py-2 min-h-[44px] flex items-center"
              >
                → Ver no Discogs
              </a>
              <Link
                href="/curadoria"
                className="block font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft hover:text-accent py-2 min-h-[44px] flex items-center"
              >
                → Voltar à triagem
              </Link>
            </div>
          </div>
        </aside>

        {/* Right: tracklist */}
        <section className="min-w-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline pb-3 md:pb-4 border-b border-line mb-4 md:mb-6 gap-1">
            <span className="eyebrow">
              Tracklist · {disc.tracks.length} {disc.tracks.length === 1 ? 'faixa' : 'faixas'}
            </span>
            <span className="font-serif italic text-[15px] md:text-[16px] text-ink-soft">
              {selectedCount} selecionadas
              {bombCount > 0 ? (
                <span className="text-accent"> · {bombCount} bomba{bombCount > 1 ? 's' : ''}</span>
              ) : null}
            </span>
          </div>

          {disc.tracks.length === 0 ? (
            <div className="border border-dashed border-line p-6 md:p-10 text-center">
              <p className="font-serif italic text-lg text-warn">
                Tracklist indisponível no Discogs para este release.
              </p>
              <p className="label-tech text-ink-mute mt-2 mb-4">
                Tente reimportar; se o Discogs corrigir o release depois, a tracklist aparece aqui.
              </p>
              <div className="flex justify-center">
                <ReimportButton recordId={disc.id} variant="default" />
              </div>
            </div>
          ) : (
            [...bySide.entries()].map(([side, items]) => (
              <div key={side} className="mb-8 md:mb-10">
                <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-accent mb-3 pb-2 border-b border-accent/40">
                  Lado {side}
                </p>
                {items.map((t) => (
                  <TrackCurationRow
                    key={t.id}
                    track={t}
                    recordId={disc.id}
                    recordArtist={disc.artist}
                    moodSuggestions={moodSuggestions}
                    contextSuggestions={contextSuggestions}
                    aiConfigured={aiConfigured}
                  />
                ))}
              </div>
            ))
          )}

          {/* CTA de conclusão — todas as edições já foram salvas
              automaticamente via Server Actions; o botão é puramente
              navegacional, mas fecha o ciclo "curadoria deste disco". */}
          <div className="border-t border-line pt-6 md:pt-8 mt-8 md:mt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
            <p className="font-serif italic text-[14px] text-ink-mute leading-relaxed">
              Todas as alterações já foram salvas. Volte à coleção quando
              terminar com este disco.
            </p>
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-[0.14em] bg-ink text-paper px-6 py-3 min-h-[44px] flex items-center justify-center rounded-sm hover:bg-accent transition-colors whitespace-nowrap self-start md:self-auto"
            >
              ✓ Concluir e voltar à coleção
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="inline">{label} · </dt>
      <dd className="inline text-ink m-0">{value}</dd>
    </div>
  );
}
