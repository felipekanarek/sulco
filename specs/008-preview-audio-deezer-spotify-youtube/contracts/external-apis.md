# Contratos — APIs externas

## Deezer Search

**Base**: `https://api.deezer.com`
**User-Agent obrigatório**: `Sulco/0.1 ( marcus@infoprice.co )`
**Sem auth**, sem token, sem cookie.

### Search por artist + title

**Request**:
```
GET /search?q={URL-encoded "artist title"}&limit=1
```

Exemplo:
```
GET /search?q=Spoon%20Before%20Destruction&limit=1
```

**Response (validado empiricamente em 2026-04-26)**:
```ts
type DeezerSearchResponse = {
  data: Array<{
    id: number;                    // Deezer track ID
    title: string;                 // título da faixa
    preview: string;               // URL MP3 30s, OU string vazia se sem preview
    duration: number;              // duração da faixa (segundos), > 30 normalmente
    artist: { id: number; name: string };
    album: { id: number; title: string };
  }>;
  total: number;
  next?: string;                   // pagination — não usamos
};
```

### Estados de retorno

| Cenário | `data` | `data[0].preview` | Ação |
|---|---|---|---|
| Match com preview | `[{ ... }]` | URL `cdnt-preview.dzcdn.net/.../*.mp3` | Cache `previewUrl=URL` |
| Match sem preview (raro) | `[{ ... }]` | `""` | Cache `previewUrl=''` (marker) |
| Sem hit | `[]` | — | Cache `previewUrl=''` (marker) |
| HTTP 4xx/5xx ou network | — | — | Erro estruturado, NÃO grava cache (próximo retry vale) |

### Erros / robustez

- `503 Service Unavailable` → throw `DeezerServiceError`. Cliente
  recebe erro, mostra "tentar de novo".
- Bot mitigation Akamai (Cookie `_abck`/`bm_sz`): com User-Agent
  identificado e ritmo gentil (uma chamada por click manual), não
  esperamos disparar. Se acontecer (5xx persistente), escalar pra
  link-out manual.
- Timeout: 8s. Server Action retorna erro estruturado.

---

## Spotify Search URL (link-out)

**Sem auth, sem API**. URL determinística aberta em nova aba.

```ts
function spotifySearchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}
```

Comportamento esperado:
- DJ logado em Spotify Premium: vê resultados, clica na faixa, ouve
  full-length
- DJ logado free: vê resultados, ouve preview 30s (mesma que Deezer
  oferece) com paywall pra full
- DJ não logado: vê preview 30s e CTA pra signup

Sulco não controla nada disso — apenas leva o DJ pra busca.

---

## YouTube Search URL (link-out)

**Sem auth, sem API**. URL determinística aberta em nova aba.

```ts
function youtubeSearchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`;
}
```

DJ vê resultados e escolhe vídeo. Sem dependência de quota YouTube
Data API.

**Evolução futura** (fora do escopo 008): embed inline do 1º
resultado via YouTube Data API v3 + iframe. Custo: 1 quota unit por
busca (10k/dia free) + complexidade de player.
