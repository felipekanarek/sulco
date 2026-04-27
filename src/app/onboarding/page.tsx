import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { OnboardingForm } from '@/components/onboarding-form';

// saveDiscogsCredential dispara runInitialImport via after() que pode
// precisar de vários segundos para fazer a primeira varredura da coleção.
// Hobby default (10s) é curto; declaramos 60 (max Hobby) para a action ter fôlego.
export const maxDuration = 60;

/**
 * Rota `/onboarding` (FR-050).
 * Usuário chega aqui via middleware sempre que `needsOnboarding === true`.
 * Uma vez concluído, o server action redireciona para `/`.
 */
export default async function OnboardingPage() {
  // Middleware garante que só usuários autenticados chegam aqui.
  // `requireCurrentUser` lança se algo inconsistente — evita loop silencioso.
  const user = await requireCurrentUser();
  if (!user.needsOnboarding) redirect('/');

  return (
    <div className="max-w-[640px] mx-auto px-4 md:px-8">
      <p className="eyebrow mb-4">Onboarding</p>
      <h1 className="font-serif italic text-3xl md:text-4xl mb-4 md:mb-6 leading-tight">
        Conecte sua coleção do Discogs
      </h1>
      <p className="text-ink-soft mb-6 md:mb-8 leading-relaxed">
        O Sulco lê sua coleção do Discogs para espelhar metadados de discos e faixas.
        A curadoria (status, faixas selecionadas, BPM, Bomba, etc.) é sempre sua e
        nunca é sobrescrita pelo Discogs.
      </p>

      <OnboardingForm />

      <details className="mt-8 md:mt-10 text-sm text-ink-mute">
        <summary className="cursor-pointer hover:text-ink min-h-[44px] flex items-center">Como gerar um Personal Access Token no Discogs?</summary>
        <ol className="list-decimal list-inside space-y-2 mt-4 pl-2">
          <li>
            Faça login em{' '}
            <a
              href="https://www.discogs.com/settings/developers"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              discogs.com/settings/developers
            </a>
            .
          </li>
          <li>Clique em &quot;Generate new token&quot;.</li>
          <li>Copie o token gerado e cole no campo acima.</li>
          <li>O token fica cifrado no banco do Sulco; você pode revogar no Discogs a qualquer momento.</li>
        </ol>
      </details>
    </div>
  );
}
