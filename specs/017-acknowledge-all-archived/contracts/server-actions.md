# Contract — Server Actions (Inc 17)

**Feature**: 017-acknowledge-all-archived
**File**: [src/lib/actions.ts](../../../src/lib/actions.ts)

---

## `acknowledgeAllArchived()`

**Signature**:

```typescript
'use server';

export async function acknowledgeAllArchived(): Promise<
  | { ok: true; count: number }
  | { ok: false; error: string }
>;
```

### Inputs

Nenhum input externo. A action deriva `userId` da sessão via
`requireCurrentUser()` (helper compartilhado, já em uso em outras
actions). Sem Zod necessário.

### Behavior

1. Resolver `userId` da sessão via `requireCurrentUser()`. Se não houver
   user (não-autenticado), o helper redireciona pra `/convite-fechado`
   conforme convenção do projeto — action não chega a executar.
2. Executar bulk UPDATE single-statement:

   ```sql
   UPDATE records
   SET archived_acknowledged_at = ?  -- now() em UTC
   WHERE user_id = ?
     AND archived = 1
     AND archived_acknowledged_at IS NULL;
   ```

   Implementado via Drizzle `db.update(records).set(...).where(and(...))`.
3. Capturar contagem de linhas afetadas (`count`).
4. Chamar `revalidatePath('/status')` e `revalidatePath('/')` para
   atualizar tanto a página /status quanto o banner global.
5. Retornar `{ ok: true, count }`.

### Atomicity

Single-statement DML é executado em transação implícita atômica pelo
SQLite/Turso. Sem transação manual.

### Error handling

- Erro de DB (raro: indisponibilidade): captura em try/catch e retorna
  `{ ok: false, error: 'Falha ao reconhecer — tente novamente.' }`.
- Não logar PII além do necessário (`userId` opcional em log de erro).
- Não throw para preservar shape de retorno consistente com
  `updateSet` (Inc 015).

### Concurrency / Race

- Se sync rodar concorrente e arquivar novos records DURANTE a execução
  desta action, esses NÃO entram no UPDATE corrente porque o filtro
  `archived_acknowledged_at IS NULL` já foi avaliado no momento do
  statement. DJ vê novos archived na próxima visita.
- Se DJ clicar 2× rapidamente, o `useTransition` no cliente desabilita
  o botão durante `isPending` (FR-009). Mesmo se chegar duplicado,
  segundo UPDATE não afeta linhas (filtro `IS NULL` já foi consumido).

### Multi-user isolation

`WHERE user_id = ?` garante que records de outros users não são tocados
mesmo com manipulação de URL/cliente. Verificável manualmente em
quickstart cenário 4 (SC-003).

### Return shape

| Caso | Retorno |
|------|---------|
| Sucesso (≥1 linha) | `{ ok: true, count: N }` |
| Sucesso (0 linhas — race onde tudo já foi reconhecido) | `{ ok: true, count: 0 }` |
| Erro de DB | `{ ok: false, error: 'Falha ao reconhecer — tente novamente.' }` |

### Caller (client component)

`<AcknowledgeAllArchivedButton>` chama via `useTransition`:

```typescript
startTransition(async () => {
  const res = await acknowledgeAllArchived();
  if (!res.ok) {
    setError(res.error);
    return;
  }
  router.refresh();
});
```

`window.confirm` é avaliado antes da chamada à action.

### Side effects

- DB write em N linhas de `records` (apenas coluna
  `archivedAcknowledgedAt`).
- Cache invalidation em `/status` e `/`.
- Nenhum write em fontes externas (Discogs).
- Nenhum log/email.

### Não-objetivos (explicitamente fora do escopo)

- NÃO retorna lista de IDs reconhecidos (UI não precisa).
- NÃO permite filtrar subset (apenas user atual, todos os pendentes).
  Para reconhecer subset, DJ usa botões individuais por card.
