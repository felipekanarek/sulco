# Data Model — Inc 30 Excluir set

**Phase**: 1
**Status**: ZERO schema delta. Apenas operação DELETE em entities existing.

## Entities tocadas

### `sets` (existing) — alvo do DELETE

| Campo | Tipo | Constraint |
|---|---|---|
| id | INTEGER | PK autoincrement |
| user_id | INTEGER | NOT NULL, FK users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| event_date | INTEGER (timestamp) | nullable |
| location | TEXT | nullable |
| briefing | TEXT | nullable |
| montar_filters_json | TEXT | nullable |
| created_at | INTEGER (timestamp) | default unixepoch() |
| updated_at | INTEGER (timestamp) | default unixepoch() |

Operação: `DELETE FROM sets WHERE id = ? AND user_id = ?`.

### `set_tracks` (existing) — cascade automático

| Campo | Tipo | Constraint |
|---|---|---|
| set_id | INTEGER | NOT NULL, FK sets(id) **ON DELETE CASCADE** ✓ |
| track_id | INTEGER | NOT NULL, FK tracks(id) ON DELETE CASCADE |
| order | INTEGER | |

PK composta `(set_id, track_id)`.

**Verificado**: linha 215 de `src/db/schema.ts` tem `.references(() => sets.id, { onDelete: 'cascade' })`.

Comportamento: ao deletar 1 row em `sets`, todas as `set_tracks` com `set_id = X` são deletadas automaticamente pelo SQLite via cascade. Sem código TS adicional.

### `tracks`, `records` (existing) — INTOCADAS

Nenhum cascade de `set_tracks` pra `tracks`. Quando uma row em `set_tracks` é deletada, a `track` correspondente continua existindo. Tracks/records permanecem 100% intactos com toda curadoria autoral preservada.

## Migration

**Nenhuma**. Schema permanece idêntico.

## Server Action signature

Em [src/lib/actions.ts](../../src/lib/actions.ts):

```ts
const deleteSetSchema = z.object({
  setId: z.number().int().positive(),
});

export async function deleteSet(
  input: z.infer<typeof deleteSetSchema>,
): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const parsed = deleteSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'ID inválido.' };
  }

  const result = await db
    .delete(setsTable)
    .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
    .returning({ id: setsTable.id });

  if (result.length === 0) {
    return { ok: false, error: 'Set não encontrado.' };
  }

  revalidatePath('/sets');
  return { ok: true };
}
```

**Custo**: 1 DELETE atomic (com cascade automático em set_tracks). ~1-poucas dezenas de rows lidas no banco (proporcional a `set_tracks.set_id = X`).

## Lifecycle de um set (ilustração)

```
[create] →  INSERT sets ...                    (Inc 1, createSet)
   ↓
[edit] →    UPDATE sets SET ... WHERE id=?     (Inc 16, updateSet)
   ↓
[montar] →  INSERT/DELETE set_tracks ...       (existing addTrackToSet/removeTrackFromSet)
   ↓
[DELETE] → DELETE sets WHERE id=? AND userId=? (Inc 30 NOVO)
            ↓ (cascade)
            DELETE set_tracks WHERE set_id=?  (automático SQLite)
   ↓
✗ Set não existe mais. Tracks intactas.
```

## Reversão

`git revert <commit-inc-30>` remove a Server Action + componente. Sem migration pra reverter. Sets já deletados continuam apagados (recuperação só via backup do banco).

## Notas

- Sem schema delta = zero ordem de deploy crítica.
- Cascade FK existing testado em prod ao deletar user (records cascade), mas operação manual de delete de set é nova.
- Custo trivial: ~1-poucas dezenas de rows.
- Multi-user safe via `WHERE userId = user.id` + FK cascade.
