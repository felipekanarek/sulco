import Link from 'next/link';
import { db, records, tracks } from '@/db';
import { eq, sql, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type SearchParams = { status?: string; q?: string; curated?: string };

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? 'all';
  const curatedFilter = sp.curated ?? 'all';
  const query = sp.q ?? '';

  // Query com contagem de faixas e selecionadas
  const rows = await db
    .select({
      id: records.id,
      artist: records.artist,
      title: records.title,
      year: records.year,
      label: records.label,
      country: records.country,
      format: records.format,
      styles: records.styles,
      status: records.status,
      curated: records.curated,
      shelfLocation: records.shelfLocation,
      tracksTotal: sql<number>`(select count(*) from ${tracks} where ${tracks.recordId} = ${records.id})`,
      tracksSelected: sql<number>`(select count(*) from ${tracks} where ${tracks.recordId} = ${records.id} and ${tracks.selected} = 1)`,
    })
    .from(records)
    .orderBy(desc(records.importedAt));

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (curatedFilter === 'yes' && !r.curated) return false;
    if (curatedFilter === 'no' && r.curated) return false;
    if (query) {
      const q = query.toLowerCase();
      const hit =
        r.artist.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.label ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    unrated: rows.filter((r) => r.status === 'unrated').length,
    curated: rows.filter((r) => r.curated).length,
    notCurated: rows.filter((r) => !r.curated).length,
    selectedTotal: rows.reduce((acc, r) => acc + Number(r.tracksSelected), 0),
  };

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      {/* Head */}
      <section className="grid grid-cols-[1fr_auto] items-end gap-8 pb-6 border-b border-line mb-8">
        <div>
          <p className="eyebrow mb-2">felipekanarek · discogs</p>
          <h1 className="title-display text-[44px]">Coleção</h1>
        </div>
        <dl className="flex gap-10 items-end">
          <Stat label="Discos" value={stats.total.toLocaleString('pt-BR')} />
          <Stat label="Curados" value={stats.curated.toLocaleString('pt-BR')} />
          <Stat label="Não curados" value={stats.notCurated.toLocaleString('pt-BR')} />
          <Stat label="Faixas selecionadas" value={stats.selectedTotal.toLocaleString('pt-BR')} />
        </dl>
      </section>

      {/* Toolbar */}
      <section className="flex flex-col gap-4 mb-8 pb-4">
        <div className="grid grid-cols-[320px_1fr] gap-8 items-center">
          <form method="GET" action="/">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Buscar por artista, título, selo…"
              className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[19px] italic placeholder:text-ink-mute outline-none focus:border-accent"
            />
            {statusFilter !== 'all' && <input type="hidden" name="status" value={statusFilter} />}
            {curatedFilter !== 'all' && <input type="hidden" name="curated" value={curatedFilter} />}
          </form>
          <div className="flex gap-3 justify-end flex-wrap">
            <span className="label-tech text-ink-mute self-center mr-1">status</span>
            <FilterChip href={queryUrl({ status: undefined, curated: curatedFilter === 'all' ? undefined : curatedFilter, q: query })} active={statusFilter === 'all'}>
              Todos · {stats.total}
            </FilterChip>
            <FilterChip href={queryUrl({ status: 'active', curated: curatedFilter === 'all' ? undefined : curatedFilter, q: query })} active={statusFilter === 'active'}>
              Ativos · {stats.active}
            </FilterChip>
            <FilterChip href={queryUrl({ status: 'unrated', curated: curatedFilter === 'all' ? undefined : curatedFilter, q: query })} active={statusFilter === 'unrated'}>
              Não avaliados · {stats.unrated}
            </FilterChip>
            <FilterChip href={queryUrl({ status: 'discarded', curated: curatedFilter === 'all' ? undefined : curatedFilter, q: query })} active={statusFilter === 'discarded'}>
              Descartados
            </FilterChip>
          </div>
        </div>
        <div className="flex gap-3 justify-end flex-wrap">
          <span className="label-tech text-ink-mute self-center mr-1">curadoria</span>
          <FilterChip href={queryUrl({ status: statusFilter === 'all' ? undefined : statusFilter, curated: undefined, q: query })} active={curatedFilter === 'all'}>
            Todos
          </FilterChip>
          <FilterChip href={queryUrl({ status: statusFilter === 'all' ? undefined : statusFilter, curated: 'yes', q: query })} active={curatedFilter === 'yes'}>
            Curados · {stats.curated}
          </FilterChip>
          <FilterChip href={queryUrl({ status: statusFilter === 'all' ? undefined : statusFilter, curated: 'no', q: query })} active={curatedFilter === 'no'}>
            Não curados · {stats.notCurated}
          </FilterChip>
        </div>
      </section>

      {/* Lista */}
      <ol className="border-t border-line">
        {filtered.length === 0 ? (
          <li className="py-12 text-center font-serif italic text-ink-mute">
            Nenhum disco encontrado.
          </li>
        ) : (
          filtered.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[72px_1fr_1fr_auto] gap-6 items-center py-6 border-b border-line-soft hover:bg-paper-raised transition-colors"
            >
              <Link href={`/disco/${r.id}`} className="cover w-[72px] h-[72px] block" aria-hidden />
              <div className="min-w-0">
                <p className="label-tech mb-1">{r.artist}</p>
                <h3 className="font-serif italic text-[22px] font-medium tracking-tight leading-tight mb-2">
                  <Link href={`/disco/${r.id}`} className="hover:text-accent">{r.title}</Link>
                </h3>
                <p className="label-tech">
                  {r.label} · {r.year} · {r.format} · {r.country}
                </p>
              </div>
              <div>
                <p className="font-serif italic text-[13px] text-ink-soft mb-2">
                  {(r.styles ?? []).slice(0, 3).join(' · ') || '—'}
                </p>
                <p className="label-tech">
                  {r.tracksTotal > 0 ? (
                    <>
                      <span className="text-ink font-medium">{r.tracksSelected}</span>
                      <span className="text-ink-mute">/{r.tracksTotal}</span>
                      <span className="text-ink-mute"> curadas</span>
                    </>
                  ) : (
                    '—'
                  )}
                  {r.shelfLocation && <span className="text-ink-mute"> · {r.shelfLocation}</span>}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <CuratedBadge curated={r.curated} />
                  <StatusBadge status={r.status} />
                </div>
                <Link
                  href={`/disco/${r.id}`}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors rounded-sm"
                >
                  Curadoria →
                </Link>
              </div>
            </li>
          ))
        )}
      </ol>

      <div className="flex justify-between items-center pt-6 mt-4">
        <p className="label-tech">Mostrando {filtered.length} de {stats.total}</p>
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

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 rounded-full border transition-colors ${
        active
          ? 'bg-ink text-paper border-ink'
          : 'border-line text-ink-soft hover:border-ink hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

function CuratedBadge({ curated }: { curated: boolean }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] px-3 py-1 border rounded-sm ${
        curated ? 'text-ok border-ok' : 'text-ink-mute border-line'
      }`}
    >
      {curated ? 'Curado' : 'Não curado'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    active: { label: 'Ativo', cls: 'text-ok border-ok' },
    unrated: { label: 'Não avaliado', cls: 'text-warn border-warn' },
    discarded: { label: 'Descartado', cls: 'text-ink-mute border-ink-mute' },
  }[status] ?? { label: status, cls: 'text-ink-mute border-ink-mute' };
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.14em] px-3 py-1 border rounded-sm ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function queryUrl(params: { status?: string; q?: string; curated?: string }): string {
  const u = new URLSearchParams();
  if (params.status) u.set('status', params.status);
  if (params.curated) u.set('curated', params.curated);
  if (params.q) u.set('q', params.q);
  const s = u.toString();
  return s ? `/?${s}` : '/';
}
