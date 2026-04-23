import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';

type SearchParams = Promise<{ status?: string; total?: string }>;

/**
 * Rota `/curadoria/concluido` (FR-015).
 * Exibida ao avaliar o último disco do filtro em triagem.
 */
export default async function CuradoriaConcluidoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  const sp = await searchParams;
  const total = Number(sp.total ?? 0) || 0;
  const status = sp.status ?? 'unrated';

  return (
    <div className="max-w-[720px] mx-auto px-8 text-center pt-6">
      <p className="eyebrow mb-4">Curadoria</p>
      <h1 className="title-display text-[48px] mb-4">Fim da lista</h1>
      <p className="font-serif italic text-[22px] text-ink-soft mb-8">
        Você passou por{' '}
        <span className="text-ink">{total.toLocaleString('pt-BR')}</span>{' '}
        {total === 1 ? 'disco' : 'discos'} com filtro{' '}
        <span className="text-ink">{labelForStatus(status)}</span>.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.12em] px-5 py-3 border border-ink text-ink hover:bg-ink hover:text-paper rounded-sm transition-colors"
        >
          Voltar à coleção
        </Link>
        <Link
          href={`/curadoria?status=${status}`}
          className="font-mono text-[11px] uppercase tracking-[0.12em] px-5 py-3 border border-line text-ink-soft hover:border-ink hover:text-ink rounded-sm transition-colors"
        >
          Reiniciar triagem
        </Link>
      </div>
    </div>
  );
}

function labelForStatus(s: string) {
  return (
    { unrated: 'Não avaliados', active: 'Ativos', discarded: 'Descartados', all: 'Todos' }[
      s
    ] ?? s
  );
}
