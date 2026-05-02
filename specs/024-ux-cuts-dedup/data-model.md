# Data Model — Cortes UX agressivos + dedup de queries

**Phase**: 1
**Status**: N/A — feature não introduz, modifica nem deleta entidades de dados

## Entidades afetadas

Nenhuma. Esta feature é puramente de UI/render — schema continua intocado em [src/db/schema.ts](../../src/db/schema.ts).

## Tabelas/colunas referenciadas (apenas leitura)

Listadas para clareza de impacto:

| Tabela | Uso pós-Inc 26 |
|---|---|
| `users` | leitura (1× por request via `react.cache()`) |
| `user_facets` | leitura (1× por request via `react.cache()`) |
| `records` | leitura paginada (LIMIT 50) em `queryCollection` — sem mudança |
| `tracks` | leitura agregada em `queryCollection` — sem mudança |
| `sync_runs` | leitura condicional (apenas se import card renderiza); UPDATE em zombie cleanup move pra cron diário |

## Migration

Nenhuma. Sem schema delta.

## Notas

- `archived` records continuam sendo criados via `archiveRecord()` no sync — fluxo preservado.
- `archived_acknowledged_at` continua sendo escrito via Server Actions `acknowledgeArchivedRecord` e `acknowledgeAllArchived` — fluxo preservado.
- Helper `listCuradoriaIds` em `src/lib/queries/curadoria.ts` é deletado (sem callers). Não há perda de dados — apenas remoção de código morto.
