import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { UpdateCredentialForm } from '@/components/update-credential-form';
import { DeleteAccountModal } from '@/components/delete-account-modal';

// Substituir credencial dispara runInitialImport via after() — mesmo motivo
// de /onboarding (página pode precisar de até 60s de fôlego em Hobby).
export const maxDuration = 60;

/**
 * Rota `/conta` — perfil do DJ, credencial Discogs, apagar conta (FR-004, FR-042).
 */
export default async function ContaPage() {
  const user = await requireCurrentUser();
  if (user.needsOnboarding) redirect('/onboarding');

  return (
    <div className="max-w-[760px] mx-auto px-4 md:px-8">
      <section className="pb-4 md:pb-6 border-b border-line mb-6 md:mb-8">
        <p className="eyebrow mb-2">sua conta</p>
        <h1 className="title-display text-[30px] md:text-[44px]">Conta</h1>
      </section>

      <section className="mb-8 md:mb-12 pb-6 md:pb-8 border-b border-line-soft">
        <h2 className="font-serif italic text-[20px] md:text-[24px] font-medium mb-3 md:mb-4">Identidade</h2>
        <p className="label-tech text-ink-mute mb-1">Email</p>
        <p className="font-mono text-[14px] md:text-[15px] break-all">{user.email || '—'}</p>
      </section>

      <section className="mb-8 md:mb-12 pb-6 md:pb-8 border-b border-line-soft">
        <h2 className="font-serif italic text-[20px] md:text-[24px] font-medium mb-3 md:mb-4">Credencial Discogs</h2>
        {user.discogsCredentialStatus === 'invalid' ? (
          <p
            role="alert"
            className="bg-accent/10 border border-accent text-ink px-4 py-2 mb-4 font-serif text-[14px] md:text-[15px]"
          >
            Token inválido — substitua abaixo para retomar o sync.
          </p>
        ) : null}
        <UpdateCredentialForm currentUsername={user.discogsUsername ?? ''} />
      </section>

      <section>
        <h2 className="font-serif italic text-[20px] md:text-[24px] font-medium mb-3 md:mb-4 text-warn">
          Zona perigosa
        </h2>
        <p className="font-serif italic text-[15px] md:text-[16px] text-ink-soft leading-relaxed mb-5 md:max-w-[560px]">
          Apagar a conta remove permanentemente todos os dados: coleção, curadoria
          acumulada (status, faixas selecionadas, BPM, Bomba, sets, histórico de
          sincronização). Não há como desfazer.
        </p>
        <DeleteAccountModal />
      </section>
    </div>
  );
}
