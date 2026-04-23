import { requireCurrentUser } from '@/lib/auth';

/** Rota `/sets/novo` — criação de set (FR-022). Implementação plena em US3 (T069..T070). */
export default async function NewSetPage() {
  await requireCurrentUser();
  return (
    <div className="max-w-[720px] mx-auto px-8">
      <p className="eyebrow mb-4">Novo set</p>
      <h1 className="font-serif italic text-4xl">Criar set</h1>
      <p className="text-ink-soft mt-4">Formulário completo em US3 (T069..T070).</p>
    </div>
  );
}
