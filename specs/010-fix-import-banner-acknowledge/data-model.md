# Data Model — Fix Bug 13

## Schema delta

### `users` table

Adiciona uma coluna nullable de timestamp:

```ts
// src/db/schema.ts (dentro de sqliteTable('users', { ... }))
importAcknowledgedAt: integer('import_acknowledged_at', { mode: 'timestamp' }),
```

**Tipo**: `integer` em SQLite (Unix epoch via Drizzle `mode: 'timestamp'`).
**Nullable**: sim. Default null = "DJ nunca reconheceu import nenhum".
**Sem index**: leitura é sempre 1 row por user (já indexado pela PK), e
não há ordenação/filtro por essa coluna.

### Migração

`npm run db:push` aplica via Drizzle Kit. SQLite aceita `ALTER TABLE
ADD COLUMN nullable` sem reescrever a tabela. Zero downtime, zero
backfill — todos os users existentes começam com `null`.

**Comportamento backward compat**: quando `lastAck = null` e
`runStartedAt != null` em estado terminal, banner aparece (FR-003). Isso
significa que **na primeira visita pós-deploy**, qualquer DJ com import
concluído verá o banner uma vez (com botão fechar). Comportamento
desejado — equivalente a "primeiro reconhecimento explícito ainda
pendente".

## Entidade derivada (não persistida)

### `ImportProgress` (return type de `getImportProgress`)

Tipo TypeScript, não tabela. Estende o atual com 2 campos:

```ts
export type ImportProgress = {
  running: boolean;
  x: number;
  y: number;
  outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial' | 'idle';
  errorMessage: string | null;
  // NOVOS:
  runStartedAt: Date | null;        // startedAt do último syncRun, null se nenhum
  lastAck: Date | null;             // users.importAcknowledgedAt, null se nunca
};
```

**Origem dos campos**:
- `runStartedAt`: lido junto com o `latest[0]` em `getImportProgress`
  (ajustar `select` para incluir `syncRuns.startedAt`).
- `lastAck`: lido a partir de `users.importAcknowledgedAt` na mesma
  query do `requireCurrentUser` ou query adicional curtinha pelo
  `user.id` (ver decisão em research.md).

## Regra de visibilidade (lógica do componente)

```text
Não renderizar  → state.outcome === 'idle' && state.x === 0  (zero-state preserved)
Renderizar      → state.running                              (FR-001, sem botão fechar)
Renderizar      → !running && runStartedAt && (lastAck === null || lastAck < runStartedAt)
Não renderizar  → caso contrário (terminal já reconhecido)
```

## Side-effects das mutations

### `acknowledgeImportProgress(userId)`

- Lê: nada (action toma apenas `requireCurrentUser`).
- Escreve: `users.importAcknowledgedAt = now()` para o user corrente.
- Revalida: `/`.
- Não toca: nenhum campo AUTHOR (Princípio I respeitado).
- Idempotente: chamar 2x não muda a semântica (segundo timestamp
  apenas substitui o primeiro). Sem race condition relevante.
