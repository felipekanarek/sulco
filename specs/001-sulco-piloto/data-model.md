# Phase 1 — Data Model

Fonte única da verdade: `src/db/schema.ts` (Drizzle ORM). Este documento é o
espelho humano desse schema, incluindo constraints, índices, tipos derivados
e transições de estado. A implementação MUST garantir paridade 1:1.

Convenção: colunas do Discogs marcadas **DISCOGS**; colunas autorais (soberanas
pela Constituição, Princípio I) marcadas **AUTHOR**; colunas operacionais
(criadas/mantidas pelo sistema, não pelo DJ nem pelo Discogs) marcadas **SYS**.

---

## `users`

Conta autenticada do DJ, ancorada na Clerk.

| Coluna | Tipo | Nulo? | Origem | Notas |
|---|---|---|---|---|
| `id` | int PK autoinc | — | SYS | PK local; referenciada por FKs |
| `clerkUserId` | text UNIQUE | — | SYS | ID do usuário na Clerk (ex: `user_abc123`) |
| `email` | text | — | SYS | Espelhado da Clerk em `user.created`/`user.updated` |
| `discogsUsername` | text | sim | AUTHOR | Preenchido no onboarding (FR-004) |
| `discogsTokenEncrypted` | text | sim | AUTHOR | AES-256-GCM; formato `v1:<iv>:<tag>:<ct>` |
| `discogsCredentialStatus` | text (`valid`/`invalid`) | — | SYS | Default `valid`; vira `invalid` em 401 (FR-044) |
| `lastStatusVisitAt` | timestamp | sim | SYS | atualizado quando DJ abre `/status`; usado pela lógica de badge (FR-041) para decidir se há alertas não vistos |
| `createdAt` | timestamp (unixepoch) | — | SYS | |
| `updatedAt` | timestamp (unixepoch) | — | SYS | |

**Relações**: 1:N com `records`, `sets`, `syncRuns`.

**Cascade**: `onDelete: cascade` em todas as FKs apontando para `users.id`
(FR-042 hard-delete).

**Não persistido, derivado em runtime**: `needsOnboarding = discogsUsername IS NULL
OR discogsTokenEncrypted IS NULL`.

---

## `records`

LP na coleção do DJ; espelho do Discogs + campos autorais.

| Coluna | Tipo | Nulo? | Origem | Notas |
|---|---|---|---|---|
| `id` | int PK autoinc | — | SYS | |
| `userId` | int FK → users.id | — | SYS | cascade delete |
| `discogsId` | int | — | DISCOGS | Release ID do Discogs |
| `artist` | text | — | DISCOGS | |
| `title` | text | — | DISCOGS | |
| `year` | int | sim | DISCOGS | |
| `label` | text | sim | DISCOGS | |
| `country` | text | sim | DISCOGS | |
| `format` | text | sim | DISCOGS | ex: `"LP"`, `"2xLP, Album"` |
| `coverUrl` | text | sim | DISCOGS | URL absoluta; pode quebrar no futuro |
| `genres` | text JSON string[] | — | DISCOGS | default `[]` |
| `styles` | text JSON string[] | — | DISCOGS | default `[]` |
| `status` | text (`unrated`/`active`/`discarded`) | — | AUTHOR | default `unrated` (FR-005/FR-006) |
| `shelfLocation` | text | sim | AUTHOR | ex: `"E1-P2"` |
| `notes` | text | sim | AUTHOR | max 5000 chars (FR-017d) |
| `curated` | boolean | — | AUTHOR | default `false`; marcado quando DJ conclui curadoria das faixas (FR-020b) |
| `curatedAt` | timestamp | sim | AUTHOR | preenchido/zerado junto com `curated` |
| `archived` | boolean | — | SYS | default `false`; `true` quando saiu do Discogs (FR-036) |
| `archivedAt` | timestamp | sim | SYS | |
| `archivedAcknowledgedAt` | timestamp | sim | SYS | null = DJ ainda não reconheceu; preenchido quando DJ age sobre o aviso (FR-036/FR-041) |
| `importedAt` | timestamp | — | SYS | |
| `updatedAt` | timestamp | — | SYS | |

**Constraints**:
- UNIQUE `(userId, discogsId)` — Q3/sessão 2 (dedupe de cópias Discogs).
- INDEX `(userId, status)` para listagem/curadoria.
- INDEX `(userId, archived)` para filtro de painel de status.

**Transições de `status`**: `unrated` ↔ `active` ↔ `discarded`. Qualquer
transição permitida via FR-011; persistência imediata com revalidatePath.

**Cascade**: delete de `users` deleta `records`. Delete de `records` deleta
`tracks` em cascata (já modelado).

---

## `tracks`

Faixa de um LP; espelho do Discogs + curadoria.

| Coluna | Tipo | Nulo? | Origem | Notas |
|---|---|---|---|---|
| `id` | int PK autoinc | — | SYS | |
| `recordId` | int FK → records.id | — | SYS | cascade delete |
| `position` | text | — | DISCOGS | `"A1"`, `"B3"` |
| `title` | text | — | DISCOGS | |
| `duration` | text | sim | DISCOGS | `"5:23"` |
| `selected` | boolean | — | AUTHOR | default `false`; FR-016 |
| `bpm` | int | sim | AUTHOR | `[0, 250]` (FR-017c) |
| `musicalKey` | text | sim | AUTHOR | regex `^(?:[1-9]\|1[0-2])[AB]$` (FR-017b) |
| `energy` | int | sim | AUTHOR | `[1, 5]` |
| `rating` | int | sim | AUTHOR | `{1, 2, 3}` = `+/++/+++` (FR-020c) |
| `moods` | text JSON string[] | — | AUTHOR | default `[]`; termos normalizados lowercase+trim (FR-017a) |
| `contexts` | text JSON string[] | — | AUTHOR | default `[]`; mesma normalização |
| `fineGenre` | text | sim | AUTHOR | |
| `references` | text | sim | AUTHOR | |
| `comment` | text | sim | AUTHOR | |
| `isBomb` | boolean | — | AUTHOR | default `false`; FR-018 |
| `conflict` | boolean | — | SYS | default `false`; `true` quando Discogs remove a faixa (FR-037) |
| `conflictDetectedAt` | timestamp | sim | SYS | |
| `updatedAt` | timestamp | — | SYS | |

**Constraints**:
- UNIQUE `(recordId, position)` — prevê duplicatas de espelho.
- INDEX `(recordId, selected)` para filtro de candidatos em montagem.
- CHECK `bpm BETWEEN 0 AND 250` quando não-nulo.
- CHECK `energy BETWEEN 1 AND 5` quando não-nulo.
- CHECK `rating IN (1,2,3)` quando não-nulo.
- CHECK `musicalKey REGEXP '^(?:[1-9]|1[0-2])[AB]$'` quando não-nulo (Drizzle
  não emite REGEXP em SQLite; validação garantida no Zod da Server Action).

**Resolução de conflito** (FR-037a):
- "Manter no Sulco" → `conflict = false`, `conflictDetectedAt = null`, campos
  autorais intactos.
- "Descartar" → DELETE do row (cascade em `setTracks`).

**Retorno após reaparição** (FR-037b):
- Faixa descartada que volta no Discogs → novo row com defaults autorais.
- Faixa "Mantida" que volta → row existente reconciliado (já está lá, só
  atualiza espelho Discogs).

---

## `sets`

Coletânea ordenada de faixas para um evento.

| Coluna | Tipo | Nulo? | Origem | Notas |
|---|---|---|---|---|
| `id` | int PK autoinc | — | SYS | |
| `userId` | int FK → users.id | — | SYS | cascade |
| `name` | text | — | AUTHOR | |
| `eventDate` | timestamp (UTC) | sim | AUTHOR | input datetime-local convertido para UTC |
| `location` | text | sim | AUTHOR | |
| `briefing` | text | sim | AUTHOR | |
| `montarFiltersJson` | text JSON | — | AUTHOR | estado dos filtros da tela de montagem (FR-024a); default `{}` |
| `createdAt` | timestamp | — | SYS | |
| `updatedAt` | timestamp | — | SYS | |

**Status DERIVADO** (não persistido — FR-028):

```
status =
  eventDate IS NULL           → 'draft'
  eventDate > nowInAppTz()    → 'scheduled'
  eventDate <= nowInAppTz()   → 'done'
```

Onde `nowInAppTz()` compara em `America/Sao_Paulo`.

Campo `status` removido do schema (estava no schema antigo como persistido,
deve sair).

**Estrutura de `montarFiltersJson`**:

```json
{
  "bpm": { "min": 100, "max": 125 },
  "musicalKey": ["8A", "9A"],
  "energy": { "min": 3, "max": 5 },
  "moods": ["solar", "festivo"],
  "contexts": ["pico"],
  "bomba": "only" | "none" | "any",
  "text": "jazz"
}
```

Todos os campos são opcionais; ausência = filtro inativo.

---

## `setTracks` (junção N:N)

| Coluna | Tipo | Nulo? | Origem | Notas |
|---|---|---|---|---|
| `setId` | int FK → sets.id | — | SYS | cascade |
| `trackId` | int FK → tracks.id | — | SYS | cascade |
| `order` | int | — | AUTHOR | posição no set |

**PK composta**: `(setId, trackId)`.
**INDEX** `(setId, order)` para carregar em ordem.

FR-029 reforçado em contrato: remover um `setTracks` NEVER toca `tracks.selected`
nem `tracks.isBomb`.

---

## `syncRuns`

Registro de execuções de import/sync/reimport (FR-039/FR-040).

| Coluna | Tipo | Nulo? | Origem | Notas |
|---|---|---|---|---|
| `id` | int PK autoinc | — | SYS | |
| `userId` | int FK → users.id | — | SYS | cascade |
| `kind` | text (`initial_import`/`daily_auto`/`manual`/`reimport_record`) | — | SYS | |
| `targetRecordId` | int FK → records.id | sim | SYS | preenchido quando `kind=reimport_record` |
| `startedAt` | timestamp | — | SYS | |
| `finishedAt` | timestamp | sim | SYS | null enquanto em andamento |
| `outcome` | text (`running`/`ok`/`erro`/`rate_limited`/`parcial`) | — | SYS | default `running` |
| `newCount` | int | — | SYS | default 0 |
| `removedCount` | int | — | SYS | default 0 |
| `conflictCount` | int | — | SYS | default 0 |
| `errorMessage` | text | sim | SYS | |
| `lastCheckpointPage` | int | sim | SYS | checkpoint de retomada para import grande (número de página) |
| `snapshotJson` | text JSON | sim | SYS | lista de `discogsId`s observados na primeira página do último `daily_auto`/`manual`; usada pela próxima execução para detectar remoções (FR-036) sem ambiguidade |

**Índices**:
- `(userId, startedAt DESC)` para painel de status.
- `(userId, outcome)` para detectar "última falha sem sucesso posterior" no
  badge do header (FR-041).

---

## Removidos do escopo

- `playlists`, `playlistTracks` — ficam no schema existente mas **não são
  usados neste piloto**. Não receberão mutations, não aparecem na UI. Remover
  fica para um incremento futuro.

---

## Seeds

Seed de dev em `src/db/seed.ts`:

- 30 discos de exemplo + tracklist por disco.
- Primeiro disco com algumas faixas `selected` para facilitar smoke test.

Vocabulário sugerido em `src/lib/vocabulary.ts` (fonte ÚNICA):

```ts
export const DEFAULT_MOOD_SEEDS = [
  'solar','festivo','melancólico','dançante','profundo',
  'etéreo','denso','hipnótico','emocional','cru'
];
export const DEFAULT_CONTEXT_SEEDS = [
  'pico','warm up','festa diurna','after','aquece',
  'fechamento','drop','transição'
];
```

Essas constantes são a fonte de sugestões de autocomplete em TODO contexto
(dev, prod, conta nova, conta com anos de uso) — sempre aparecem mescladas
aos termos que o DJ já usou, respeitando a ordem de FR-017a. O seed de dev
**não injeta** mais termos nos arrays `tracks.moods`/`tracks.contexts` com o
único objetivo de popular sugestões: a responsabilidade de "ter sugestões
iniciais" é só das constantes.

---

## Tipos derivados (TypeScript)

```ts
// gerados pelo Drizzle ($inferSelect / $inferInsert)
export type User = typeof users.$inferSelect;
export type Record = typeof records.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Set = typeof sets.$inferSelect;
export type SetTrack = typeof setTracks.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;

// derivados explícitos no lib/
export type SetStatus = 'draft' | 'scheduled' | 'done';
export type BombaFilter = 'any' | 'only' | 'none';
export type MontarFilters = {
  bpm?: { min?: number; max?: number };
  musicalKey?: string[];
  energy?: { min?: number; max?: number };
  moods?: string[];
  contexts?: string[];
  bomba?: BombaFilter;
  text?: string;
};
```
