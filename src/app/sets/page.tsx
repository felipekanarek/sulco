import { requireCurrentUser } from '@/lib/auth';

/**
 * Rota `/sets` — listagem de sets (FR-021). Implementação plena em US3 (T067..T068).
 */
export default async function SetsPage() {
  await requireCurrentUser();
  return (
    <div className="max-w-[1240px] mx-auto px-8">
      <p className="eyebrow mb-4">Sets</p>
      <h1 className="font-serif italic text-4xl">Sets em construção</h1>
      <p className="text-ink-soft mt-4">
        Listagem de sets com status derivado de eventDate virá em US3 (T067..T068).
      </p>
    </div>
  );
}
