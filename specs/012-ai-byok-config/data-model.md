# Data Model — Inc 14 (BYOK)

## Schema delta

### `users` table — 3 colunas novas

```ts
// src/db/schema.ts (dentro de sqliteTable('users', { ... }))

aiProvider: text('ai_provider', {
  enum: ['gemini', 'anthropic', 'openai', 'deepseek', 'qwen'],
}),
aiModel: text('ai_model'),
aiApiKeyEncrypted: text('ai_api_key_encrypted'),
```

Todas **nullable**. Default null = "sem config".

### Migração

**Local** (dev):
```bash
sqlite3 sulco.db "ALTER TABLE users ADD COLUMN ai_provider TEXT;"
sqlite3 sulco.db "ALTER TABLE users ADD COLUMN ai_model TEXT;"
sqlite3 sulco.db "ALTER TABLE users ADD COLUMN ai_api_key_encrypted TEXT;"
```

**Prod** (Turso): equivalente via `turso db shell sulco-prod` antes
do push (decisão 7 do [research.md](./research.md)).

Sem index — leitura é sempre 1 row por user (já indexado pela PK).

## Invariantes

- **Atomicidade da config**: ou as 3 colunas são `null` (sem config),
  ou as 3 são preenchidas (config ativa). Nunca estado parcial.
  Garantido por `testAndSaveAIConfig` (escreve todas em uma única
  query) e `removeAIConfig` (limpa todas).
- **Multi-user isolation**: todas as ações fazem `WHERE id = userId`
  com user obtido via `requireCurrentUser`. Sem possibilidade de
  vazamento entre contas.
- **`ai_api_key_encrypted` é OPACO**: o servidor só decifra para
  chamadas reais ao provider (ping ou enrichTrackComment). NUNCA
  retornado em Server Action de leitura. UI exibe `"✓ Configurada"`
  ou nada.

## Entidade derivada (interna)

### `AIConfig` (em memória, helper read-only)

```ts
// src/lib/ai/types.ts
export type Provider = 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'qwen';

export type AIConfig = {
  provider: Provider;
  model: string;
  // chave em texto puro — só existe em memória dentro de adapters
  // Nunca exposta em Server Action de leitura externa.
  apiKey: string;
};

export type AIConfigStatus =
  | { configured: false }
  | { configured: true; provider: Provider; model: string };
  // SEM apiKey aqui — leitura "publica" não vaza chave (FR-004, SC-003).
```

### Helper `getUserAIConfig` (read-only)

Devolve `AIConfig` (com chave decifrada) — uso interno por adapters.
Marcado como `'server-only'` pra Vercel não bundle no client.

### Helper `getUserAIConfigStatus` (read-only, expõe a UIs)

Devolve `AIConfigStatus` (sem chave). É o que `/conta` e Inc 13/1
chamam pra decidir UI.

## Side-effects das mutations

### `testAndSaveAIConfig({ provider, model, apiKey })`
- Lê: nada do DB; chama provider externo (ping).
- Escreve: 3 colunas em `users` se ping ok.
- Revalida: `/conta`.

### `removeAIConfig()`
- Lê: nada.
- Escreve: 3 colunas → null.
- Revalida: `/conta`.

### Auditoria
Sem tabela de auditoria. Operações são raras (1-3 vezes na vida
da conta) e a chave é segredo do DJ — se ele rotacionar/deletar,
não há valor em logar isso.
