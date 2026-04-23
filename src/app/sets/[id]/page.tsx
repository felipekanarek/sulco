import { requireCurrentUser } from '@/lib/auth';

/** Rota `/sets/[id]` (FR-027). Implementação plena em US3 (T080..T082). */
export default async function SetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentUser();
  const { id } = await params;
  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <p className="eyebrow mb-4">Set</p>
      <h1 className="font-serif italic text-4xl">Set #{id}</h1>
      <p className="text-ink-soft mt-4">Vista completa + bag física em US3 (T080..T082).</p>
    </div>
  );
}
