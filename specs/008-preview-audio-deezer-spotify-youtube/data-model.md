# Phase 1 — Data Model: Preview de áudio (008)

**Data**: 2026-04-26
**Referência de schema**: `src/db/schema.ts`

---

## Delta de schema

### `tracks` — adicionar 2 colunas

| Campo | Tipo | Nullable | Default | Descrição |
|---|---|---|---|---|
| `previewUrl` | `TEXT` | ✅ | `NULL` | URL Deezer 30s da preview. Quatro estados (ver tabela abaixo). |
| `previewUrlCachedAt` | `INTEGER` (timestamp) | ✅ | `NULL` | Epoch da última tentativa (sucesso ou falha). Usado pra distinguir "nunca tentei" de "tentei e cacheei". |

**Drizzle (adicionar em `tracks`)** — após `audioFeaturesSyncedAt`:

```ts
// 008 — preview de áudio (zona SYS)
previewUrl: text('preview_url'),
previewUrlCachedAt: integer('preview_url_cached_at', { mode: 'timestamp' }),
```

**Migração**:
- Dev: `npm run db:push`
- Prod: ALTER manual via Turso CLI:
  ```sql
  ALTER TABLE tracks ADD COLUMN preview_url TEXT;
  ALTER TABLE tracks ADD COLUMN preview_url_cached_at INTEGER;
  ```

**Sem índice novo** — acesso é sempre por `tracks.id` (já PK), e o
campo não é usado em filtro de listagem nem ordenação.

---

## Estados de cache do `previewUrl`

| `previewUrl` | `previewUrlCachedAt` | Estado | UI |
|---|---|---|---|
| `NULL` | `NULL` | nunca tentado | botão ▶ idle |
| `URL` (string não-vazia) | timestamp | preview disponível | botão ▶ idle, click toca |
| `''` (string vazia) | timestamp | tentou, sem dado Deezer | botão Deezer disabled + tooltip "sem preview" |

**Transições válidas**:

```
nunca tentado ──[resolveTrackPreview]──┬──> preview disponível
                                       └──> sem dado
preview disponível ──[invalidateTrackPreview]──> nunca tentado (cliente re-dispara resolve)
sem dado ──[invalidateTrackPreview]──> nunca tentado
```

`invalidateTrackPreview` é a única forma de **recuperar** estado
"nunca tentado" depois de qualquer tentativa. É chamada pelo botão
"tentar de novo" quando:
- (a) `<audio>` falhou (`onerror`) durante reprodução de URL cacheada
- (b) DJ clica em botão pequeno "tentar de novo" ao lado do estado
  "indisponível"

---

## Princípio I — campos protegidos

`tracks` agora tem **3 zonas** distintas:

| Zona | Campos | Quem escreve |
|---|---|---|
| **DISCOGS** (espelho) | `position`, `title`, `duration`, `recordId` | Apenas `applyDiscogsUpdate` (sync) |
| **AUTHOR** (curadoria) | `selected`, `bpm`, `musicalKey`, `energy`, `rating`, `moods`, `contexts`, `fineGenre`, `references`, `comment`, `isBomb` | Apenas DJ via `updateTrackCuration` |
| **SYS** (sistema) | `mbid`, `audioFeaturesSource`, `audioFeaturesSyncedAt` (005), `previewUrl`, `previewUrlCachedAt` (008), `conflict`, `conflictDetectedAt`, `updatedAt` | Apenas o sistema (jobs, server actions) |

Convenção: campos AUTHOR são write-protected da SYS (Princípio I).
Campos SYS são write-only do sistema (DJ não vê nem edita
`previewUrl` na UI — vê apenas o efeito visual: botão ▶ ou
"indisponível").

---

## Invariantes (testes explícitos)

| Invariante | Teste |
|---|---|
| `resolveTrackPreview` nunca grava em campos AUTHOR | `preview-principio-i.test.ts`: pré-popula track com bpm=120, moods=['solar']; chama action; asserta valores autorais inalterados |
| Cache hit não dispara fetch Deezer | `preview-resolve-cache.test.ts`: 1ª chamada mocka Deezer com 1 hit; 2ª chamada deve não chamar mock fetch (assertion via spy) |
| Cache "indisponível" persiste | `preview-no-deezer-fallback.test.ts`: mock retorna `data: []`; primeira chamada grava `previewUrl=''`; segunda chamada NÃO chama mock de novo |
| `invalidateTrackPreview` reseta cache | `preview-resolve-cache.test.ts`: simula invalidate, asserta `previewUrl=NULL && previewUrlCachedAt=NULL` |
| Ownership respeitado | qualquer teste de action: chamar com `userId=A` e `trackId` de `userId=B` retorna `{ ok: false }` |
