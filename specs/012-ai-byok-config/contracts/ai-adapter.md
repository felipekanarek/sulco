# AI Adapter — Interface comum

Todos os 5 providers implementam a mesma interface, expostos via
`src/lib/ai/providers/<provider>.ts`. O dispatcher
(`src/lib/ai/index.ts`) seleciona o adapter pelo `provider` da config
do user.

## Interface `AIAdapter`

```ts
// src/lib/ai/types.ts
export type AdapterErrorKind =
  | 'invalid_key'
  | 'invalid_model'
  | 'rate_limit'
  | 'timeout'
  | 'unknown';

export type AdapterError = {
  kind: AdapterErrorKind;
  message: string; // mensagem em pt-BR pronta pro DJ
};

export type AIAdapter = {
  /**
   * Validação de credencial + modelo. Faz 1 chamada de chat completion
   * mínima (~5 tokens, prompt 'Reply with ok'). Sucesso = 200; falha
   * mapeia o erro para AdapterErrorKind.
   */
  ping(args: { apiKey: string; model: string }): Promise<
    { ok: true } | { ok: false; error: AdapterError }
  >;

  /**
   * Geração de descrição/comment a partir de prompt arbitrário. Usado
   * pelo Inc 13 (depois desta feature). Não é invocado em /conta.
   */
  enrichTrackComment(args: {
    apiKey: string;
    model: string;
    prompt: string;
  }): Promise<{ ok: true; text: string } | { ok: false; error: AdapterError }>;
};
```

## Implementações

### `src/lib/ai/providers/gemini.ts`

SDK: `@google/generative-ai`.

```ts
const client = new GoogleGenerativeAI(apiKey);
const m = client.getGenerativeModel({ model });
const result = await m.generateContent("Reply with 'ok'.");
// 200 ok → return { ok: true }
// catch (err) → mapProviderError(err)
```

Erros típicos:
- `[401|403]` "API key not valid" → `invalid_key`
- `404` "models/X is not found" → `invalid_model`
- `429` quota exceeded → `rate_limit`

### `src/lib/ai/providers/anthropic.ts`

SDK: `@anthropic-ai/sdk`.

```ts
const client = new Anthropic({ apiKey });
const msg = await client.messages.create({
  model,
  max_tokens: 5,
  messages: [{ role: 'user', content: "Reply with 'ok'." }],
});
// 200 ok
```

Erros:
- `Anthropic.AuthenticationError` (401) → `invalid_key`
- `Anthropic.NotFoundError` (404) → `invalid_model`
- `Anthropic.RateLimitError` (429) → `rate_limit`

### `src/lib/ai/providers/openai-compat.ts`

SDK: `openai`. Compartilhado entre OpenAI, DeepSeek, Qwen — diferença
é apenas o `baseURL`:

```ts
const BASE_URLS: Record<Provider, string | undefined> = {
  openai: undefined, // default api.openai.com/v1
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};

function buildClient(provider: Provider, apiKey: string) {
  const baseURL = BASE_URLS[provider];
  return new OpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
}

const client = buildClient(provider, apiKey);
const completion = await client.chat.completions.create({
  model,
  max_tokens: 5,
  temperature: 0,
  messages: [{ role: 'user', content: "Reply with 'ok'." }],
});
```

Erros (todos do SDK `openai`):
- `OpenAI.AuthenticationError` (401) → `invalid_key`
- `OpenAI.NotFoundError` (404) → `invalid_model`
- `OpenAI.RateLimitError` (429) → `rate_limit`

## Dispatcher (`src/lib/ai/index.ts`)

```ts
import { geminiAdapter } from './providers/gemini';
import { anthropicAdapter } from './providers/anthropic';
import { openaiCompatAdapter } from './providers/openai-compat';

export function getAdapter(provider: Provider): AIAdapter {
  switch (provider) {
    case 'gemini': return geminiAdapter;
    case 'anthropic': return anthropicAdapter;
    case 'openai':
    case 'deepseek':
    case 'qwen':
      return openaiCompatAdapter(provider); // factory: bind do baseURL
  }
}
```

## Timeouts

Cada adapter chama o SDK sem timeout próprio. Timeout de 10s
(decisão Q3 da spec) é aplicado por **`testAndSaveAIConfig`** via
`Promise.race(adapter.ping(...), setTimeout(reject, 10000))`. Em
caso de timeout, action retorna mensagem genérica sem distinguir
qual provider travou.

## Logging

Adapters NÃO logam `apiKey`. Erros do SDK podem incluir partes da
key no payload — fazer scrubbing antes de qualquer `console.error`:

```ts
function scrub(s: string): string {
  return s.replace(/sk-[a-zA-Z0-9-]{10,}|AIza[a-zA-Z0-9-_]{20,}/g, '[REDACTED]');
}
```

(Aplica regex pra OpenAI `sk-…` e Gemini `AIza…`. DeepSeek/Qwen têm
formatos próprios — adicionar se aparecerem em prática.)
