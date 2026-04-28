# Quickstart — Validar Bug 13 manualmente

Pré-requisitos:
- `npm run dev` rodando em `localhost:3000`.
- Conta logada via Clerk (allowlist).
- Acesso ao banco local (`sulco.db`) via SQLite CLI ou Drizzle Studio.

## Cenário 1 — Banner some após acknowledge (P1, FR-005/FR-006)

1. Forçar estado terminal:
   ```sql
   -- garante último syncRun do user em outcome='ok' antigo
   SELECT id, outcome, started_at FROM sync_runs
     WHERE user_id = <ID> AND kind = 'initial_import'
     ORDER BY started_at DESC LIMIT 1;
   -- se necessário, UPDATE outcome='ok', finished_at=unixepoch()
   ```
2. Garantir `users.import_acknowledged_at = NULL`:
   ```sql
   UPDATE users SET import_acknowledged_at = NULL WHERE id = <ID>;
   ```
3. Acessar `/`. **Esperado**: banner verde "Import concluído" com
   contagem + botão **× fechar** no canto.
4. Clicar em **× fechar**. **Esperado**: banner some imediatamente
   (≤1 round-trip).
5. Reload da página. **Esperado**: banner permanece oculto.
6. Confere no DB:
   ```sql
   SELECT import_acknowledged_at FROM users WHERE id = <ID>;
   -- deve ser timestamp recente (>= started_at do run)
   ```

## Cenário 2 — Banner não-fechável durante running (P1, FR-002)

1. Forçar estado running:
   ```sql
   -- inserir um syncRun fake em running OU disparar import real
   INSERT INTO sync_runs (user_id, kind, outcome, started_at)
     VALUES (<ID>, 'initial_import', 'running', unixepoch());
   ```
2. Acessar `/`. **Esperado**: banner branco "Importando do Discogs"
   com barra de progresso. **Sem botão × fechar visível.**
3. Verificar com `Cmd+F` por "fechar" na página: **0 ocorrências**.
4. Limpar:
   ```sql
   UPDATE sync_runs SET outcome='ok', finished_at=unixepoch()
     WHERE id = <syncRunId> AND outcome='running';
   ```

## Cenário 3 — Nova execução faz banner reaparecer (P1, FR-007)

1. Partir do estado pós-Cenário 1 (banner reconhecido, oculto).
2. Inserir novo syncRun terminal mais recente que `import_acknowledged_at`:
   ```sql
   INSERT INTO sync_runs (user_id, kind, outcome, started_at, finished_at, new_count)
     VALUES (<ID>, 'initial_import', 'ok', unixepoch(), unixepoch(), 5);
   ```
3. Acessar `/`. **Esperado**: banner verde reaparece (com botão fechar).
4. Banner some quando reconhecido novamente.

## Cenário 4 — Banner com erro também é fechável (P2, FR-003/FR-004)

1. Inserir syncRun em outcome='erro' com errorMessage genuíno (não
   "run zumbi" — esses são mascarados como `idle`):
   ```sql
   INSERT INTO sync_runs (user_id, kind, outcome, started_at, finished_at, error_message)
     VALUES (<ID>, 'initial_import', 'erro', unixepoch(), unixepoch(), 'Falha de teste');
   UPDATE users SET import_acknowledged_at = NULL WHERE id = <ID>;
   ```
2. Acessar `/`. **Esperado**: banner amarelo "Import interrompido" com
   mensagem de erro + botão × fechar.
3. Clicar fechar → banner some. Reload mantém oculto.

## Cenário 5 — Conta sem syncRun nenhum (FR-011)

1. Conta nova ou:
   ```sql
   DELETE FROM sync_runs WHERE user_id = <ID>;
   UPDATE users SET import_acknowledged_at = NULL WHERE id = <ID>;
   -- E acervo vazio (records count = 0):
   DELETE FROM records WHERE user_id = <ID>;
   ```
2. Acessar `/`. **Esperado**: banner não renderiza (zero-state).

## Cenário 6 — Multi-user isolation (FR-008)

1. Login user A: reconhecer banner. Verificar
   `users.import_acknowledged_at` populado para A.
2. Logout, login user B (com import recém-concluído).
3. **Esperado**: user B vê banner com botão fechar (lastAck null para B).
4. User B reconhece. Verificar `import_acknowledged_at` de A não foi
   alterado.

## Smoke checks finais

- `npm run build` passa (TypeScript + lint sem erros novos).
- Console do browser sem warnings novos no fluxo de fechar.
- Network tab: clicar × fechar dispara 1 POST (Server Action) + 1 RSC
  refresh. Sem loops.
- Tap target ≥44×44px no botão fechar (DevTools → Inspect → box model).
