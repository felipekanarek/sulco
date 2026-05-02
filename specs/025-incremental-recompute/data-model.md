# Data Model — Recompute incremental + dedups remanescentes

**Phase**: 1
**Status**: N/A — feature não introduz, modifica nem deleta entidades de dados

## Entidades afetadas

Nenhuma. Esta feature é puramente de lógica de escrita (delta updates) + extensão de tipo em memória — schema permanece intocado em [src/db/schema.ts](../../src/db/schema.ts).

## Tabelas referenciadas

| Tabela | Uso pós-Inc 27 |
|---|---|
| `users` | leitura via `getCurrentUser` cacheado (Inc 26); incluir `aiProvider` + `aiModel` no objeto retornado (já existem no schema desde Inc 12) |
| `user_facets` | escrita via deltas direcionados (counters via UPDATE com expressão; vocabulary/shelves via recompute parcial UPSERT) |
| `records` | leitura para `prev` status em `updateRecordStatus`; outros writes em records seguem inalterados |
| `tracks` | leitura em recompute parcial de vocabulary (`aggregateVocabulary`); writes em tracks seguem inalterados |
| `sync_runs` | sem mudança |

## Migration

Nenhuma. Sem schema delta.

## Notas

- `aiProvider`, `aiModel`, `aiApiKeyEncrypted` já existem em `users` desde Inc 12 (BYOK).
- `recordsTotal`, `recordsActive`, `recordsUnrated`, `recordsDiscarded`, `tracksSelectedTotal`, `genresJson`, `stylesJson`, `moodsJson`, `contextsJson`, `shelvesJson`, `updatedAt` em `user_facets` já existem desde Inc 24.
- Esta feature troca **como** esses campos de `user_facets` são atualizados, não **o que** eles armazenam.
