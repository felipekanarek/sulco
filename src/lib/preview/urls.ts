// 008 — URL builders client-safe pra link-out de preview.
// NÃO marcar como 'server-only' — cliente importa direto.
// Funções puras, sem side effects.

export function spotifySearchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}

export function youtubeSearchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`;
}
