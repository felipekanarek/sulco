import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import {
  ClerkProvider,
  Show,
  UserButton,
  SignInButton,
  SignUpButton,
} from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { DiscogsCredentialBanner } from '@/components/discogs-credential-banner';
import { ArchivedRecordsBanner } from '@/components/archived-records-banner';
import { SyncBadge } from '@/components/sync-badge';
import { PreviewPlayerProvider } from '@/components/preview-player-context';
import { MobileNavTrigger } from '@/components/mobile-nav';

export const metadata: Metadata = {
  title: 'Sulco — curadoria de vinil para DJs',
  description: 'Seu Discogs, mas para discotecar',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ClerkProvider localization={ptBR}>
          <PreviewPlayerProvider>
            <Header />
            {/* Banners globais (FR-045, FR-036) — RSC lê DB a cada request */}
            <DiscogsCredentialBanner />
            <ArchivedRecordsBanner />
            {/* Inc 23 follow-up (022 / Bug 16): <ImportPoller> global removido —
                rodava setInterval 10s em todas as rotas autenticadas chamando
                getImportProgress, mesmo após import completo. Causava ~86k
                row reads/dia desnecessários (aba aberta). <ImportProgressCard>
                na home tem polling próprio de 3s só durante import ativo,
                o que basta. */}
            <main className="min-h-[calc(100vh-140px)] py-10">{children}</main>
            <footer className="border-t border-line py-6">
              <div className="max-w-[1240px] mx-auto px-8">
                <p className="eyebrow text-center">Sulco · protótipo nível 2 · Next.js + SQLite local</p>
              </div>
            </footer>
          </PreviewPlayerProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line backdrop-blur bg-paper/90 py-3 md:py-6">
      <div className="max-w-[1240px] mx-auto px-4 md:px-8 grid grid-cols-[auto_1fr_auto] items-center md:items-baseline gap-4 md:gap-12">
        <Link
          href="/"
          className="font-serif italic text-[22px] md:text-[26px] font-medium tracking-tight"
        >
          Sulco<span className="text-accent not-italic">.</span>
        </Link>
        <nav className="hidden md:flex gap-10 justify-center">
          <Show when="signed-in">
            <NavLink href="/">Coleção</NavLink>
            <NavLink href="/sets">Sets</NavLink>
            <NavLink href="/status">Sync</NavLink>
          </Show>
        </nav>
        <span className="label-tech flex items-center gap-2 md:gap-3">
          {/* SyncBadge é RSC e verifica sessão internamente; renderiza null
              quando deslogado ou sem alertas. */}
          <SyncBadge />
          <Show when="signed-in">
            {/* Link "Conta" só desktop (mobile vai pelo drawer) */}
            <Link
              href="/conta"
              className="hidden md:inline hover:text-ink transition-colors"
            >
              Conta
            </Link>
            {/* UserButton: única instância (Clerk não suporta múltiplas) */}
            <UserButton />
            {/* Mobile: hambúrguer abre drawer com nav */}
            <MobileNavTrigger className="md:hidden" />
          </Show>
          <Show when="signed-out">
            <span className="hidden md:flex items-center gap-2">
              <SignInButton />
              <SignUpButton />
            </span>
            <span className="md:hidden flex items-center gap-2">
              <SignInButton />
            </span>
          </Show>
        </span>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute hover:text-ink transition-colors pb-1 border-b border-transparent"
    >
      {children}
    </Link>
  );
}

