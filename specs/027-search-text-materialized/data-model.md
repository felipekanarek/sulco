# Data Model — Search text materializado em records

**Phase**: 1
**Status**: schema delta de 1 coluna + 1 index

## Entidade afetada

### `records` — adiciona `search_text`

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| **search_text** *(novo)* | `TEXT` | `NOT NULL DEFAULT ''` | Versão pre-normalizada de `artist + ' ' + title + ' ' + (label ?? '')` via `normalizeText()`. Lowercase + sem diacríticos. Atualizado por sync (`applyDiscogsUpdate`) e import (`runInitialImport`). |

### Index novo

- `records_user_search_text_idx ON records(user_id, search_text)` — compound index. Cobre filtro `WHERE user_id = ? AND search_text LIKE ?`. Lado esquerdo do LIKE com `%` não usa o index pra prefix-match, mas filtro `user_id` reduz drasticamente o scan (~2588 → ~poucos por LIKE no LIKE).

## Migration SQL

```sql
ALTER TABLE records ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
CREATE INDEX records_user_search_text_idx ON records(user_id, search_text);
```

Aplicar em ordem:
1. **Local sqlite** (dev): `sqlite3 sulco.db < migration.sql`
2. **Prod Turso**: `turso db shell sulco-prod` colando o SQL.

## Backfill

Após migration aplicada, rodar `scripts/_backfill-search-text.mjs`:

```js
SELECT id, artist, title, label FROM records;
// Para cada row: UPDATE records SET search_text = normalize(artist + ' ' + title + ' ' + (label ?? '')) WHERE id = ?
```

Custo: ~2588 reads + 2588 writes (1× total, idempotente).

## Atualização contínua

Hooks em writes (não há novos schemas, apenas computação ao gravar):

| Operação | Onde | O que faz |
|---|---|---|
| Insert via sync | `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) | Computa `search_text` ao montar payload INSERT |
| Update via sync | `applyDiscogsUpdate` (mesmo) | Re-computa `search_text` ao mudar artist/title/label |
| Insert via import inicial | `runInitialImport` em [src/lib/discogs/import.ts](../../src/lib/discogs/import.ts) | Computa `search_text` ao processar cada release |

DJ não escreve em `artist`/`title`/`label` diretamente — esses são zona SYS (Princípio I). Logo, sem hooks adicionais.

## Reversão

Se necessário reverter (Inc futuro ou rollback):

```sql
DROP INDEX records_user_search_text_idx;
ALTER TABLE records DROP COLUMN search_text;
```

Código antigo (Inc 18 JS post-filter) recuperável via `git revert` do commit do Inc 32.

## Notas

- Coluna existe desde a migration mas vazia até backfill. Código novo só funciona pós-backfill — daí ordem crítica em [tasks.md](./tasks.md).
- `normalizeText` do Inc 18 é determinística: `lowercase + NFD + remove marks (\p{M})`. Mesma input → mesmo output. Backfill pode rodar várias vezes sem divergir.
- Helper novo `computeRecordSearchText(artist, title, label)` em `src/lib/text.ts` centraliza a regra de composição (3 campos com espaço separador).
