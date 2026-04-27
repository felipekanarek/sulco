import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { NewSetForm } from '@/components/new-set-form';

/**
 * Rota `/sets/novo` — criação de set (FR-022).
 * Ao submeter, redireciona para `/sets/[id]/montar` (US3 sub-fase 5.2).
 */
export default async function NovoSetPage() {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  return (
    <div className="max-w-[720px] mx-auto px-4 md:px-8">
      <section className="pb-4 md:pb-6 border-b border-line mb-6 md:mb-8">
        <p className="eyebrow mb-2">novo set</p>
        <h1 className="title-display text-[28px] md:text-[36px]">Montar set</h1>
      </section>

      <NewSetForm />
    </div>
  );
}
