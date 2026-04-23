# Contract — Discogs Client

Cliente HTTP para a API pública do Discogs, centralizado em
`src/lib/discogs/client.ts`. Regras:

1. **Rate limit**: bucket de 60 req/min por usuário (chave: `userId`). Antes
   de cada request, bloqueia até haver "token" disponível. Em HTTP 429, usa
   `Retry-After` do header (com jitter ±10%); sem ele, backoff exponencial
   (1s, 2s, 4s, cap 60s).
2. **Autenticação**: header `Authorization: Discogs token=<PAT>` após
   decriptar via `decryptPAT(user.discogsTokenEncrypted)`.
3. **Invalid credential**: HTTP 401 em qualquer chamada → o chamador MUST
   invocar `markCredentialInvalid(userId)` que persiste
   `users.discogsCredentialStatus='invalid'` e cancela o run atual
   (FR-044..FR-046).
4. **User-Agent**: `User-Agent: Sulco/0.1 (+https://sulco.app)` (obrigatório
   pela Discogs TOS).
5. Nenhuma função deste cliente escreve em campos AUTHOR; apenas lê do
   Discogs e retorna. A aplicação ao banco vive em `applyDiscogsUpdate`
   (ver abaixo), que **só** toca colunas DISCOGS.

---

## Interface pública

```ts
// src/lib/discogs/client.ts

export type DiscogsRelease = {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  country: string | null;
  format: string | null;
  coverUrl: string | null;
  genres: string[];
  styles: string[];
  tracklist: {
    position: string;
    title: string;
    duration: string | null;
  }[];
};

export type CollectionPage = {
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  releases: {
    id: number;       // release id
    date_added: string; // ISO
  }[];
};

export interface DiscogsClient {
  validateCredential(pat: string): Promise<boolean>;
  fetchCollectionPage(
    userId: number,
    opts: { page: number; perPage?: number },
  ): Promise<CollectionPage>;
  fetchRelease(userId: number, releaseId: number): Promise<DiscogsRelease>;
}
```

`validateCredential` é usado no onboarding e ao salvar novo PAT; ele NÃO
passa pelo bucket (executa direto), porque a chamada precede o registro do
usuário no sistema de quota.

---

## Função de aplicação ao banco

```ts
// src/lib/discogs/sync.ts
export async function applyDiscogsUpdate(
  userId: number,
  release: DiscogsRelease,
  opts: { isNew: boolean }
): Promise<{ recordId: number; created: boolean }>;
```

Contratos de `applyDiscogsUpdate`:

- **Upsert por `(userId, discogsId)`** (Q3/sessão 2 — dedupe).
- Escreve apenas: `discogsId`, `artist`, `title`, `year`, `label`, `country`,
  `format`, `coverUrl`, `genres`, `styles`, `updatedAt`.
- NEVER escreve: `status`, `shelfLocation`, `notes`, `archived` (em `records`).
- Para tracks: `INSERT` faixas novas com defaults autorais (selected=false,
  isBomb=false, etc). Para faixas que já existiam (match por `(recordId,
  position)`): `UPDATE` só das colunas DISCOGS (`title`, `duration`).
- Para faixas que o Discogs **removeu** (estavam no banco, não vieram no
  release atual): marca `conflict=true, conflictDetectedAt=now()`. NEVER
  deleta.
- **Reaparição de faixa em conflito (FR-037b)**: se uma faixa com
  `conflict=true` volta a aparecer no release, o UPDATE das colunas Discogs
  também zera `conflict=false, conflictDetectedAt=null`. Todos os campos
  autorais permanecem intactos (a faixa "kept" está sendo reconciliada
  automaticamente).
- **Reaparição de disco arquivado (FR-037b)**: se `(userId, discogsId)`
  existir em `records` com `archived=true`, o upsert também zera
  `archived=false, archivedAt=null, archivedAcknowledgedAt=null`. Campos
  autorais permanecem intactos.
- Se `opts.isNew=true`, a nova linha começa com `status='unrated'`. Em
  reaparição `opts.isNew` NÃO se aplica (usa-se upsert sobre row
  existente).

---

## Rotinas de sync (jobs)

```ts
// src/lib/discogs/import.ts
export async function runInitialImport(
  userId: number,
  opts?: { resumeFromPage?: number }
): Promise<SyncOutcome>;

// src/lib/discogs/sync.ts
export async function runDailyAutoSync(userId: number): Promise<SyncOutcome>;
export async function runManualSync(userId: number): Promise<SyncOutcome>;

// src/lib/discogs/reimport.ts
export async function reimportRecordJob(
  userId: number,
  recordId: number
): Promise<SyncOutcome>;
```

`SyncOutcome`:

```ts
type SyncOutcome =
  | { outcome: 'ok'; newCount: number; removedCount: number;
      conflictCount: number }
  | { outcome: 'parcial'; lastCheckpointPage: number; reason: string }
  | { outcome: 'rate_limited'; retryAfterSeconds: number }
  | { outcome: 'erro'; errorMessage: string };
```

**`runInitialImport`**:
1. Cria syncRun `kind='initial_import'`.
2. Itera páginas da coleção Discogs (per_page=100).
3. Para cada release na página, chama `fetchRelease` e
   `applyDiscogsUpdate(isNew=true)`.
4. A cada página concluída, atualiza `syncRuns.lastCheckpointPage`.
5. Em 429 → marca `rate_limited` e **salva checkpoint** (permite retomada).
6. Em 401 → cancela, marca credencial inválida.
7. Ao final, `outcome='ok'` com contagens.

**`runDailyAutoSync` / `runManualSync`**:
1. Busca apenas **primeira página** ordenada por `date_added desc` (FR-032).
2. Compara com snapshot local:
   - `discogsId` não existente → `applyDiscogsUpdate(isNew=true)`, incrementa
     `newCount`.
   - `discogsId` existente → compara metadados; se diferentes, aplica update
     (só colunas DISCOGS).
3. Detecta remoções comparando com o `snapshotJson` do último syncRun
   `daily_auto`/`manual` para o usuário: cada `discogsId` presente no
   snapshot anterior E ausente na primeira página atual recebe
   `archived=true` (FR-036). Importante: releases em páginas interiores
   (fora do snapshot) NÃO podem ser marcados como removidos por este job
   — isso fica para sync manual completo.
4. Ao final, grava `snapshotJson = [discogsIds da primeira página atual]`
   no novo syncRun, para uso pelo próximo sync.
5. Invoca `fetchRelease` só para releases que mudaram `date_added` recente
   (detecta correção de metadata).

**`reimportRecordJob`**:
1. Verifica cooldown (FR-034a) — mesma query descrita em
   `server-actions.md`.
2. Chama `fetchRelease` e `applyDiscogsUpdate(isNew=false)`.
3. Cria syncRun `kind='reimport_record', targetRecordId=recordId`.

---

## Observabilidade

Cada call HTTP ao Discogs emite log estruturado:

```json
{
  "event": "discogs.fetch",
  "userId": 42,
  "endpoint": "GET /releases/12345",
  "status": 200,
  "durationMs": 184,
  "rateLimitRemaining": 58
}
```

Em 429, `rateLimitRemaining: 0` e `retryAfter` presente. Esses logs alimentam
o painel `/status` (FR-040) via agregação de `syncRuns`.
