import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sulco — curadoria de vinil para DJs',
  description: 'Seu Discogs, mas para discotecar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Header />
        <main className="min-h-[calc(100vh-140px)] py-10">{children}</main>
        <footer className="border-t border-line py-6">
          <div className="max-w-[1240px] mx-auto px-8">
            <p className="eyebrow text-center">Sulco · protótipo nível 2 · Next.js + SQLite local</p>
          </div>
        </footer>
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
          <NavLink href="/">Coleção</NavLink>
          <NavLink href="/sets">Sets</NavLink>
          <NavLink href="/sets/novo">Montar</NavLink>
        </nav>
        <span className="label-tech flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
          Sincronizado
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
