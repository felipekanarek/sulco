/**
 * Placeholder de capa (FR-008 edge case — "Imagem da capa quebrada").
 * Box com iniciais do artista; contraste AA (texto escuro em cinza claro).
 */
export function CoverPlaceholder({ artist }: { artist: string }) {
  const initials = getInitials(artist);
  return (
    <div
      className="aspect-square bg-line flex items-center justify-center font-serif italic text-ink select-none"
      aria-hidden="true"
    >
      <span className="text-[22%] leading-none">{initials || '?'}</span>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
