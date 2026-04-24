import { OWNER_EMAIL } from '@/lib/auth';

/**
 * Rota pública `/convite-fechado` (FR-003, 002-multi-conta).
 * Renderizada para:
 *  - Visitantes autenticados cujo email não está em `invites` (redirecionados
 *    pelo middleware).
 *  - Acesso direto via link compartilhado.
 *
 * Zero JS, Server Component, em pt-BR, seguindo identidade editorial do piloto.
 */
export default function ConviteFechadoPage() {
  const mailtoHref = OWNER_EMAIL
    ? `mailto:${OWNER_EMAIL}?subject=Pedido%20de%20acesso%20ao%20Sulco`
    : undefined;

  return (
    <main className="max-w-[640px] mx-auto px-8 pt-24 pb-24 text-center">
      <p className="eyebrow text-accent mb-4">Acesso por convite</p>
      <h1 className="font-serif italic text-4xl leading-tight mb-6">
        O Sulco está em fase de convite
      </h1>
      <p className="font-serif text-[18px] text-ink-soft leading-relaxed mb-8">
        Estamos testando o piloto com um grupo pequeno de DJs. Se você quiser
        participar, escreve pra gente — a gente adiciona seu email e libera.
      </p>
      {mailtoHref ? (
        <a
          href={mailtoHref}
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink text-ink hover:bg-ink hover:text-paper px-5 py-3 rounded-sm transition-colors inline-block"
        >
          Solicitar acesso
        </a>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
          Contato indisponível no momento
        </p>
      )}
    </main>
  );
}
