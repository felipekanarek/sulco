# Research — Inc 14 (BYOK)

## Decisão 1: ping payload por provider

**Decisão**: cada adapter implementa um método `ping()` que faz **1
chamada de chat completion mínima** com:
- system prompt: vazio
- user prompt: `"Reply with 'ok'."`
- max tokens: 5
- temperature: 0

Tem-se sucesso se o provider retorna 200 com payload válido (não
importa o conteúdo exato da resposta — só validar credencial + modelo).

**Rationale**:
- Custo trivial em qualquer provider (~$0.00001).
- Validar mais cedo (`/v1/models` por exemplo) **não** valida que a
  combinação `(key, model)` funciona — algumas keys têm permissão pra
  listar modelos mas não pra invocar o que o user escolheu. Chat
  completion garante ponta-a-ponta.
- Resposta efetiva é descartada — basta o status code.

**Alternativas consideradas**:
- `GET /v1/models` (Gemini/OpenAI compat): mais barato (não consome
  tokens) mas não valida permissão de execução.
- Streaming-only ping: pior, alguns providers cobram por chamada
  iniciada mesmo cancelada.

## Decisão 2: baseURL OpenAI-compat (DeepSeek + Qwen)

**Decisão**:
- **DeepSeek**: `https://api.deepseek.com/v1` (compat OpenAI). SDK
  `openai` aceita via `new OpenAI({ apiKey, baseURL })`.
- **Qwen** (Alibaba DashScope OpenAI-compat mode):
  `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
  (internacional, doc pública). Tier free no DashScope é por
  conta DJ; nenhum config global necessário.
- **OpenAI**: default do SDK (sem `baseURL` custom).

**Rationale**:
- 3 providers, 1 SDK (`openai`), 1 adapter (`openai-compat.ts`) com
  `baseURL` parametrizado por `provider`. Reduz duplicação massiva.
- DeepSeek e Qwen anunciam compat com formato OpenAI Chat Completions
  desde 2024. Modelos chamados com `model: 'deepseek-chat'` ou
  `model: 'qwen-turbo'`.

**Alternativas considerardas**:
- SDK nativo de cada provider: 2 SDKs a mais, sem ganho.
- LangChain/Vercel AI SDK: adiciona ~500KB e complexidade pra
  abstrair algo que já é compat por design.

## Decisão 3: lista curada de modelos (`src/lib/ai/models.ts`)

**Decisão**: arquivo TS hardcoded, exportando `MODELS_BY_PROVIDER`:

```ts
export const MODELS_BY_PROVIDER = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
} as const;

export const MODELS_REVIEWED_AT = '2026-04-28';
```

Comentário no topo do arquivo: "Revisar trimestralmente. Modelo
deprecado pelo provider exige PR de remoção + comunicação aos DJs
afetados (FUTURE)."

**Rationale**:
- Hardcoded é a forma mais simples e confiável. Lista curada protege
  DJ de escolher modelo deprecado.
- `MODELS_REVIEWED_AT` é dívida visível — quem encontrar arquivo > 6m
  sabe que precisa revisar.
- Quando provider lançar modelo novo importante (ex: Claude 5),
  basta PR.

**Alternativas consideradas**:
- Listar modelos via API do provider em tempo real: depende de cada
  provider implementar `/v1/models`, e ainda assim retorna IDs que
  podem não ser o que o DJ deve escolher (variantes, deprecated etc).
  Pior UX.
- Permitir input livre de model ID: DJ digita errado ou usa modelo
  proibido pra sua key. Suporte vira pesadelo.

## Decisão 4: mapeamento de erros do provider

**Decisão**: cada adapter implementa um helper privado
`mapProviderError(rawError) → AdapterError` com 4 categorias:

| Categoria | Exemplos | Mensagem ao DJ |
|---|---|---|
| `'invalid_key'` | 401, 403, "Invalid API key", "Unauthorized" | "Chave inválida ou revogada — reconfigure." |
| `'invalid_model'` | 404 model, "model not found", "no access" | "Modelo não disponível pra esta chave." |
| `'rate_limit'` | 429, "rate limit" | "Limite de uso atingido — tente novamente em alguns minutos." |
| `'unknown'` | resto (timeout, 500, etc) | "Provider retornou erro: <code>. Tente novamente." |

Adapter recebe erro do SDK, faz string match em `error.message` +
status code, e devolve a categoria. Action propaga a mensagem
contextual no `ActionResult.error`.

**Rationale**:
- Não dá pra unificar 100% (cada SDK lança erro diferente). Mas 4
  categorias cobrem ~95% do que o DJ vê.
- Mensagem contextual é FR-006 + Q3.
- "Unknown" garante fallback útil sem crashar.

**Alternativas consideradas**:
- Mostrar `error.message` cru ao DJ: péssima UX (erros internos do
  SDK não são pra leigo).
- Deixar adapter retornar erro detalhado e action decide a cópia:
  embaralha responsabilidades. Simples como está.

## Decisão 5: aliases `encryptSecret` / `decryptSecret`

**Decisão**: adicionar 2 funções em [src/lib/crypto.ts](../../src/lib/crypto.ts)
como aliases dos existentes:

```ts
export const encryptSecret = encryptPAT;
export const decryptSecret = decryptPAT;
```

Manter `encryptPAT`/`decryptPAT` (callers atuais não quebram). Novos
usos (chave de IA) chamam `encryptSecret`/`decryptSecret`.

**Rationale**:
- Semanticamente errado chamar `encryptPAT(geminiKey)` num arquivo
  do adapter de IA — confunde leitor.
- Custo ~3 linhas. Zero risco. Pattern padrão de evolução de API.
- Migrar callers existentes pra `encryptSecret` fica como cleanup
  futuro (não-bloqueante).

**Alternativas consideradas**:
- Renomear `encryptPAT` → `encryptSecret`: quebra chamadas
  existentes; PR maior sem ganho real.
- Ter 2 funções totalmente separadas: duplica criptografia, abre
  bug por divergência.

## Decisão 6: estado da UI durante "Testar"

**Decisão**: client component `<AIConfigForm>` mantém estado
`{ status: 'idle' | 'testing' | 'success' | 'error', errorMsg?: string }`
via `useState` + `useTransition`. Ao clicar "Testar conexão":
1. `setStatus('testing')` + botão `disabled` + spinner inline
2. `startTransition(async () => { await testAndSaveAIConfig(...) })`
3. Result: `{ ok: true }` → `setStatus('success')` + `router.refresh()`.
4. Result: `{ ok: false, error }` → `setStatus('error')` com `errorMsg`.

**Rationale**:
- Pattern já usado no projeto (`<ImportProgressCard>`,
  `<RandomCurationButton>`).
- `useTransition` evita bloquear UI em outros componentes durante
  ping.
- `router.refresh()` no sucesso re-renderiza o RSC com config
  atualizada — botões dependentes (futuros Inc 13/1) viram habilitados
  imediatamente.

## Decisão 7: ordem de aplicação do schema em prod

**Decisão**: aplicar schema delta em prod via Turso CLI **antes do
push** (mesmo padrão Inc 010):

```bash
turso db shell sulco-prod \
  "ALTER TABLE users ADD COLUMN ai_provider TEXT; \
   ALTER TABLE users ADD COLUMN ai_model TEXT; \
   ALTER TABLE users ADD COLUMN ai_api_key_encrypted TEXT;"
```

**Rationale**:
- Schema delta ANTES do código: build de prod ainda passa (TS não
  checa DB), mas a primeira chamada de leitura (`getUserAIConfig`)
  estouraria `SQLITE_ERROR: no such column`.
- 3 ALTERs em uma sessão são atômicos do ponto de vista do user
  (todas aplicam ou nenhuma).
- Sem backfill — todos os users existentes ficam com 3 colunas null
  (= "sem config", estado válido inicial).
