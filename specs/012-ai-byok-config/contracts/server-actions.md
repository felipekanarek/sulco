# Server Actions — Contratos

Todas em `src/lib/actions.ts` (Princípio II).

## `testAndSaveAIConfig` (nova)

### Assinatura

```ts
export async function testAndSaveAIConfig(input: {
  provider: 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'qwen';
  model: string;
  apiKey: string;
}): Promise<ActionResult>;
```

### Validação Zod

```ts
const inputSchema = z.object({
  provider: z.enum(['gemini', 'anthropic', 'openai', 'deepseek', 'qwen']),
  model: z.string().min(1),
  apiKey: z.string().trim().min(10).max(500),
});
```

Adicional: validar que `model` está em `MODELS_BY_PROVIDER[provider]`
(modelo curado). Se não, `{ ok: false, error: 'Modelo não suportado.' }`.

### Comportamento

1. `requireCurrentUser` → user.
2. Parse Zod (input + check do model na lista curada).
3. Importa adapter via `getAdapter(provider)` (dispatch interno).
4. `await adapter.ping({ apiKey, model })` com timeout 10s
   (`Promise.race` com `setTimeout`).
5. Em sucesso: `db.update(users).set({ aiProvider, aiModel,
   aiApiKeyEncrypted: encryptSecret(apiKey) }).where(eq(users.id,
   user.id))`. `revalidatePath('/conta')`. `return { ok: true }`.
6. Em erro do adapter: propaga mensagem do `mapProviderError`.
7. Em timeout: `{ ok: false, error: 'Provider não respondeu — tente novamente.' }`.

### Output

`ActionResult` (`{ ok: true } | { ok: false, error }`).

### Atomicidade

A escrita do DB acontece **somente** após ping bem-sucedido (FR-005).
Sem estado intermediário.

## `removeAIConfig` (nova)

### Assinatura

```ts
export async function removeAIConfig(): Promise<ActionResult>;
```

### Comportamento

1. `requireCurrentUser`.
2. `db.update(users).set({ aiProvider: null, aiModel: null,
   aiApiKeyEncrypted: null }).where(eq(users.id, user.id))`.
3. `revalidatePath('/conta')`. `return { ok: true }`.

### Idempotente

Chamar com config já nula é no-op (não erro).

## Helpers (não Server Actions)

### `getUserAIConfigStatus` (em `src/lib/ai/index.ts`, `'server-only'`)

```ts
export async function getUserAIConfigStatus(
  userId: number
): Promise<AIConfigStatus>;
```

- Lê `users.aiProvider`, `aiModel` (NÃO lê `aiApiKeyEncrypted`).
- Devolve `{ configured: false }` se provider null.
- Devolve `{ configured: true, provider, model }` se preenchido.

Uso: RSC (`/conta` page, Inc 13/1 botões dependentes).

### `getUserAIConfig` (interno, `'server-only'`)

```ts
export async function getUserAIConfig(
  userId: number
): Promise<AIConfig | null>;
```

- Lê todas as 3 colunas. Decifra `aiApiKeyEncrypted` via `decryptSecret`.
- Devolve `null` se sem config.
- **Uso restrito**: apenas adapters (`enrichTrackComment` no Inc 13,
  `suggestSetTracks` no Inc 1). NÃO chamado de páginas/componentes.

### `enrichTrackComment` (em `src/lib/ai/index.ts`)

```ts
export async function enrichTrackComment(
  userId: number,
  prompt: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
```

Função pública usada pelo Inc 13 quando este for implementado.
Nesta feature (Inc 14), entregamos a **estrutura**: a função existe e
funciona, mas nenhum botão/UI a chama ainda. Inc 13 vai criar a
Server Action `enrichTrackCommentWithAI` que invoca esta.

Comportamento:
1. `getUserAIConfig(userId)` → null? `{ ok: false, error: 'Configure sua chave em /conta.' }`.
2. Dispatch pra adapter conforme `provider`.
3. `await adapter.enrichTrackComment({ apiKey, model, prompt })`.
4. Devolve texto retornado.
