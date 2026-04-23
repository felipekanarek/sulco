import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCurrentUser } from '@/lib/auth';
import {
  listCuradoriaIds,
  loadDisc,
  type CuradoriaStatusFilter,
} from '@/lib/queries/curadoria';
import { CuradoriaView } from '@/components/curadoria-view';

type SearchParams = Promise<{ status?: string; from?: string }>;

/**
 * Rota `/curadoria` — triagem sequencial (FR-008..FR-015).
 * Server Component carrega os IDs da lista filtrada + o disco atual;
 * a navegação por teclado vive no `<CuradoriaView>` (client).
 */
export default async function CuradoriaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const sp = await searchParams;
  const status = parseStatusFilter(sp.status);
  const fromId = sp.from ? Number(sp.from) : null;

  const ids = await listCuradoriaIds(user.id, status);

  if (ids.length === 0) {
    return (
      <div className="max-w-[960px] mx-auto px-8">
        <header className="mb-8">
          <p className="eyebrow mb-2">Curadoria</p>
          <h1 className="title-display text-[44px]">Nada para triar</h1>
        </header>
        <EmptyState currentStatus={status} />
      </div>
    );
  }

  // Determina índice inicial: respeita `from` se estiver na lista filtrada.
  let currentIndex = 0;
  if (fromId && Number.isFinite(fromId)) {
    const idx = ids.indexOf(fromId);
    if (idx >= 0) currentIndex = idx;
  }

  const currentId = ids[currentIndex];
  const disc = await loadDisc(user.id, currentId);
  if (!disc) redirect(`/curadoria?status=${status}`);

  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <CuradoriaView
        disc={disc}
        ids={ids}
        currentIndex={currentIndex}
        status={status}
      />
    </div>
  );
}

function parseStatusFilter(v: string | undefined): CuradoriaStatusFilter {
  if (v === 'unrated' || v === 'active' || v === 'discarded' || v === 'all') return v;
  return 'unrated';
}

function EmptyState({ currentStatus }: { currentStatus: CuradoriaStatusFilter }) {
  return (
    <div className="border border-dashed border-line p-10 text-center">
      <p className="eyebrow mb-3">Filtro atual: {labelFor(currentStatus)}</p>
      <p className="font-serif italic text-xl mb-6">
        Nenhum disco bate com esse filtro.
      </p>
      <div className="flex justify-center gap-3 flex-wrap">
        {currentStatus !== 'unrated' ? (
          <Link
            href="/curadoria?status=unrated"
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 border border-line hover:border-ink rounded-full"
          >
            Não avaliados
          </Link>
        ) : null}
        {currentStatus !== 'active' ? (
          <Link
            href="/curadoria?status=active"
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 border border-line hover:border-ink rounded-full"
          >
            Ativos
          </Link>
        ) : null}
        {currentStatus !== 'all' ? (
          <Link
            href="/curadoria?status=all"
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 border border-line hover:border-ink rounded-full"
          >
            Todos
          </Link>
        ) : null}
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 border border-ink text-ink hover:bg-ink hover:text-paper rounded-full"
        >
          Voltar à coleção
        </Link>
      </div>
    </div>
  );
}

function labelFor(s: CuradoriaStatusFilter) {
  return {
    unrated: 'Não avaliados',
    active: 'Ativos',
    discarded: 'Descartados',
    all: 'Todos',
  }[s];
}
