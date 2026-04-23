import { requireCurrentUser } from '@/lib/auth';

/** Rota `/sets/[id]/montar` (FR-023..FR-026). Implementação plena em US3 (T071..T079). */
export default async function MontarSetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentUser();
  const { id } = await params;
  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <p className="eyebrow mb-4">Montar set</p>
      <h1 className="font-serif italic text-4xl">Set #{id}</h1>
      <p className="text-ink-soft mt-4">Candidatos + filtros AND + DnD em US3 (T071..T079).</p>
    </div>
  );
}
