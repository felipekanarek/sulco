import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

/**
 * Banner global para credencial Discogs inválida (FR-045).
 * RSC: lê `users.discogsCredentialStatus` direto. Não renderiza nada
 * quando status=valid ou sem sessão.
 */
export async function DiscogsCredentialBanner() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.discogsCredentialStatus !== 'invalid') return null;

  return (
    <div
      role="alert"
      className="bg-accent/10 border-y border-accent text-ink px-6 py-3 flex items-center justify-between gap-4"
    >
      <p className="font-serif text-[15px]">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent mr-3">
          Token Discogs
        </span>
        Seu token do Discogs expirou ou foi revogado. O sync automático está
        pausado até você atualizar a credencial.
      </p>
      <Link
        href="/conta"
        className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-4 py-2 rounded-sm hover:bg-accent transition-colors whitespace-nowrap"
      >
        Atualizar token →
      </Link>
    </div>
  );
}
