import './globals.css';
import type { Metadata } from 'next';
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
import { ImportPoller } from '@/components/import-poller';

export const metadata: Metadata = {
  title: 'Sulco — curadoria de vinil para DJs',
  description: 'Seu Discogs, mas para discotecar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ClerkProvider localization={ptBR}>
          <Header />
          {/* Banners globais (FR-045, FR-036) — RSC lê DB a cada request */}
          <DiscogsCredentialBanner />
          <ArchivedRecordsBanner />
          {/* Poller silencioso — mantém import progredindo em qualquer rota */}
          <ImportPoller />
          <main className="min-h-[calc(100vh-140px)] py-10">{children}</main>
          <footer className="border-t border-line py-6">
            <div className="max-w-[1240px] mx-auto px-8">
              <p className="eyebrow text-center">Sulco · protótipo nível 2 · Next.js + SQLite local</p>
            </div>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line backdrop-blur bg-paper/90 py-6">
      <div className="max-w-[1240px] mx-auto px-8 grid grid-cols-[auto_1fr_auto] items-baseline gap-12">
        <Link href="/" className="font-serif italic text-[26px] font-medium tracking-tight">
          Sulco<span className="text-accent not-italic">.</span>
        </Link>
        <nav className="flex gap-10 justify-center">
          <Show when="signed-in">
            <NavLink href="/">Coleção</NavLink>
            <NavLink href="/sets">Sets</NavLink>
            <NavLink href="/status">Status</NavLink>
          </Show>
        </nav>
        <span className="label-tech flex items-center gap-3">
          {/* SyncBadge é RSC e verifica sessão internamente; renderiza null
              quando deslogado ou sem alertas. */}
          <SyncBadge />
          <Show when="signed-in">
            <Link href="/conta" className="hover:text-ink transition-colors">
              Conta
            </Link>
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton />
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

