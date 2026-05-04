# Data Model — Inc 36 (033)

## Schema delta

### Nova tabela: `record_formats`

```ts
export const recordFormats = sqliteTable(
  'record_formats',
  {
    recordId: integer('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recordId, t.token] }),
    // Index reverso pra `WHERE token IN (...)` virar lookup direto.
    tokenIdx: index('record_formats_token_idx').on(t.token, t.recordId),
  }),
);
```

- **PK composta**: `(record_id, token)` evita duplicação na pivot
  (mesmo token não aparece 2× pro mesmo record).
- **FK CASCADE**: delete físico de record (raríssimo, hard-delete via
  Inc 30 pra sets) limpa pivot.
- **Index `(token, record_id)`**: COVERING — `WHERE token = ?`
  retorna `record_id` direto do index sem scan.

### Novo index em `records`

```ts
records_user_archived_year_imported_idx
  ON records(user_id, archived, year, imported_at DESC);
```

- 4 colunas → COVERING quando query usa `WHERE user_id=? AND
  archived=? AND year=? ORDER BY imported_at DESC`.
- DESC explícito alinha com pattern Inc 35 (`records_user_archived_imported_idx`).

### Indexes preservados (sem mudança)

- `records_user_archived_year_idx` (Inc 8 follow-up): cobre queries
  sem ORDER BY.
- `records_user_archived_country_idx`, `..._label_idx`, `..._shelf_idx`:
  idem.

---

## Relacionamentos

```
records (1) ──┬─ (N) record_genres   [Inc 35]
              ├─ (N) record_styles   [Inc 35]
              └─ (N) record_formats  [Inc 36 — NOVA]

tracks (1) ──┬─ (N) track_moods      [Inc 35]
             └─ (N) track_contexts   [Inc 35]
```

---

## Tokenização (regra de população)

Reusa lógica existente em `src/lib/discogs/apply-update.ts`:

```ts
function tokenizeFormat(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
```

- Input: `records.format` ("Vinyl, LP, Album, Stereo")
- Output: `["Vinyl", "LP", "Album", "Stereo"]`
- Whitespace duplicado, vírgulas trailing, e tokens vazios filtrados.

---

## Estado de transição

| Evento | Ação na pivot |
|---|---|
| INSERT new record (sync Discogs) | INSERT N tokens via `applyPivotDelta(recordFormats, ..., tokenizeFormat(format), [])` |
| UPDATE record (format mudou) | `diffVocabArrays(tokenizeFormat(old), tokenizeFormat(new))` → `applyPivotDelta(..., diff.added, diff.removed)` |
| UPDATE record (format igual) | No-op (diff retorna `{added:[], removed:[]}`) |
| ARCHIVE record | NÃO toca pivot diretamente (filtros têm `WHERE archived=0`). FK CASCADE cobre delete físico raríssimo. |
| REAPARIÇÃO (`wasArchived=true → false`) | Re-INSERT tokens (idempotente via `onConflictDoNothing`) |

Padrão idêntico a `record_genres`/`record_styles` em [apply-update.ts](../../src/lib/discogs/apply-update.ts).

---

## Migration prod (DDL atômica)

```sql
-- Atomic batch via libsql client db.batch(stmts, 'write')
CREATE TABLE record_formats (
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  PRIMARY KEY (record_id, token)
);
CREATE INDEX record_formats_token_idx ON record_formats(token, record_id);
CREATE INDEX records_user_archived_year_imported_idx
  ON records(user_id, archived, year, imported_at DESC);
```

3 statements, 1 batch atômico. Idempotente via `IF NOT EXISTS` no
script real.

---

## Backfill (1×, prod)

Script: `scripts/_backfill-record-formats.mjs`

```ts
// Pseudo-código
SELECT id, format FROM records WHERE archived=0 AND format != NULL AND format != ''
for each record:
  tokens = tokenizeFormat(record.format)
  for each token:
    stmts.push(INSERT INTO record_formats VALUES (record.id, token))
db.batch(stmts, 'write')  // chunks de 500
```

Estimativa local (1741 records): ~5.8k entries (validado experimentalmente).
Prod (2587 records): ~10k entries esperadas.

---

## Princípio I check

- `record_formats` é **zona SYS materializada** (derivada de
  `records.format` que é DISCOGS).
- Sync Discogs popula via hook (mesmo princípio I do Inc 35).
- DJ não escreve diretamente em `record_formats`.
- ✅ Princípio I OK.

## Princípio III check

- Schema definido em `src/db/schema.ts` (single source).
- Tipos TS gerados antes de uso.
- Migration explícita via script + DDL.
- ✅ Princípio III OK.

## Princípio IV check

- Nenhum delete silencioso de records (archive preservado).
- FK CASCADE cobre delete físico **explícito** (caso raríssimo).
- Pivot é derivada — recomputável via backfill.
- ✅ Princípio IV OK.
