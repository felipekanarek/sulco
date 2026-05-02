# Data Model — Otimização do fluxo de montar set

**Phase**: 1
**Status**: N/A — feature não introduz, modifica nem deleta entidades

## Entidades afetadas

Nenhuma. Esta feature é puramente de otimização de leituras + UX de filtros — schema permanece intocado em [src/db/schema.ts](../../src/db/schema.ts).

## Tabelas referenciadas

| Tabela | Uso pós-Inc 28 |
|---|---|
| `users` | leitura via `getCurrentUser` cached (Inc 26 + Inc 27 trazem aiProvider/aiModel no objeto) |
| `userFacets` | leitura via `getUserFacets` cached (Inc 24 + Inc 26) — agora consumido por `listSelectedVocab` para vocab |
| `sets` | escrita debounced em `montar_filters_json` (Frente A) |
| `setTracks` | leitura via 1 SELECT combinado COUNT+MAX (Frente D), escrita via INSERT/DELETE |
| `tracks`, `records` | leitura em `queryCandidates` (sem mudança), ownership checks |

## Migration

Nenhuma. Sem schema delta.

## Notas

- `userFacets.moodsJson` e `contextsJson` já existem desde Inc 24. Mantidos atualizados via delta (Inc 27) + cron drift (Inc 27).
- `users.aiProvider` e `aiModel` já existem desde Inc 12 (BYOK). Já incluídos no `CurrentUser` cached desde Inc 27.
- `sets.montarFiltersJson` já existe (Inc anterior). Coluna não muda — apenas a frequência de write é reduzida via debounce.
- `setTracks` PK composta `(set_id, track_id)` continua protegendo contra duplicação no `addTrackToSet` (ON CONFLICT DO NOTHING).
