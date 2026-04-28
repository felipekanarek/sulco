# Server Actions — Contratos

Ambas em `src/lib/actions.ts` (Princípio II).

## `analyzeTrackWithAI` (nova)

### Assinatura

```ts
export async function analyzeTrackWithAI(input: {
  trackId: number;
}): Promise<ActionResult<{ text: string }>>;
```

### Validação Zod

```ts
const analyzeInputSchema = z.object({
  trackId: z.number().int().positive(),
});
```

### Comportamento

1. `requireCurrentUser` → user.
2. `safeParse(input)`. Erros → `{ ok: false, error: 'Dados inválidos.' }`.
3. **Ownership check + load do track**: query única
   ```sql
   SELECT t.position, t.title,
          r.id AS record_id, r.artist, r.title AS album, r.year,
          r.genres, r.styles
   FROM tracks t JOIN records r ON r.id = t.record_id
   WHERE t.id = ? AND r.user_id = ?
   ```
   Sem resultado → `{ ok: false, error: 'Faixa não encontrada.' }`.
   Também busca os campos audio features de `tracks` (`bpm`,
   `musicalKey`, `energy`).
4. Monta prompt via `buildTrackAnalysisPrompt(...)` (helper em
   `src/lib/prompts/track-analysis.ts`).
5. Chama `enrichTrackComment(user.id, prompt)` do Inc 14.
6. Se Inc 14 retorna `{ ok: false, error }`: propaga sem persistir.
7. Se texto retornado é vazio/whitespace: `{ ok: false, error: 'IA retornou resposta vazia — tente novamente.' }`.
8. Persiste: `db.update(tracks).set({ aiAnalysis: text.trim() }).where(eq(tracks.id, trackId))`.
9. `revalidatePath('/disco/' + recordId)`. Return `{ ok: true, data: { text } }`.

### Output

`ActionResult<{ text: string }>`. Cliente usa `data.text` pra
atualizar state local otimista (evita esperar router.refresh).

### Não-funcionais

- **Timeout**: 30s via `Promise.race(enrichTrackComment(...), timeout)`
  dentro de `analyzeTrackWithAI`. **Importante**: o
  `enrichTrackComment` do Inc 14 **não** tem timeout próprio — só
  `testAndSaveAIConfig` (ping de 10s) tem. Como geração real leva
  mais que ping, usamos 30s aqui (mais generoso que o Inc 14 ping).
  Em timeout: `{ ok: false, error: 'Provider não respondeu — tente novamente.' }`.
- **Rate limit / outros erros**: propagados via mensagem do
  `AdapterError` (Inc 14).

### Idempotência

Não-idempotente — chamar 2x com mesma input gera 2 análises
distintas (modelos têm temperature > 0). Por isso o pattern de
"re-gerar com confirmação" no client (FR-004).

## `updateTrackAiAnalysis` (nova)

### Assinatura

```ts
export async function updateTrackAiAnalysis(input: {
  trackId: number;
  recordId: number;
  text: string | null;
}): Promise<ActionResult>;
```

### Validação Zod

```ts
const updateInputSchema = z.object({
  trackId: z.number().int().positive(),
  recordId: z.number().int().positive(),
  text: z.string().max(5000).nullable(),
});
```

`max(5000)` é defesa contra payload absurdo (DJ colando livro
inteiro). Soft-limit do prompt + max_tokens do SDK já mantêm
respostas em ~500 chars; este limite é higiene de servidor.

### Comportamento

1. `requireCurrentUser`.
2. Parse.
3. **Ownership check**: `WHERE id = trackId AND record_id IN (SELECT id FROM records WHERE user_id = ?)`. Em vez de JOIN, filtro composto.
4. `text === '' ?` → null (defensive trim já feito no cliente).
5. `db.update(tracks).set({ aiAnalysis: text }).where(...)`.
6. `revalidatePath('/disco/' + recordId)`. Return `{ ok: true }`.

### Erros possíveis

- Track não pertence ao user → `{ ok: false, error: 'Faixa não encontrada.' }`.
- Texto > 5000 chars → erro de Zod, mensagem genérica.

### Idempotência

Idempotente — mesmo input dá mesmo resultado.

## Helper `buildTrackAnalysisPrompt`

Já especificado no [research.md](../research.md) decisão 4. Função
pura em [src/lib/prompts/track-analysis.ts](../../src/lib/prompts/track-analysis.ts).
Recebe campos da track + record, devolve string multi-linha.

## Componente `<TrackCurationRow>` — extensão

### Bloco "Análise" (renderizado dentro do estado expandido)

```tsx
{/* Após o bloco de "Sua nota" / comment */}
<div className="ai-analysis-block">
  <div className="flex items-center justify-between mb-1">
    <p className="label-tech text-ink-mute">Análise</p>
    <button
      type="button"
      onClick={handleAnalyze}
      disabled={!aiConfigured || isAnalyzing}
      title={!aiConfigured ? 'Configure sua chave em /conta' : undefined}
      className="..."
    >
      {isAnalyzing ? 'Analisando…' : '✨ Analisar com IA'}
    </button>
  </div>
  <textarea
    defaultValue={local.aiAnalysis ?? ''}
    onBlur={(e) => {
      const v = e.target.value.trim();
      const next = v === '' ? null : v;
      if (next !== local.aiAnalysis) saveAiAnalysis(next);
    }}
    placeholder="Sem análise — clique no botão pra gerar com IA"
    className="..."
  />
</div>
```

### Estado client adicional

- `aiConfigured: boolean` (passado como prop pelo `<page>` baseado
  em `getUserAIConfigStatus`).
- `isAnalyzing: boolean` (local, controlado por `useTransition`).

### Handler `handleAnalyze`

```tsx
async function handleAnalyze() {
  if (local.aiAnalysis && local.aiAnalysis.trim().length > 0) {
    const ok = window.confirm('Substituir análise existente?');
    if (!ok) return;
  }
  startTransition(async () => {
    const res = await analyzeTrackWithAI({ trackId: track.id });
    if (res.ok) {
      setLocal((prev) => ({ ...prev, aiAnalysis: res.data.text }));
    } else {
      setError(res.error);
    }
  });
}
```

### Handler `saveAiAnalysis(next: string | null)`

```tsx
function saveAiAnalysis(next: string | null) {
  const prev = local.aiAnalysis;
  setLocal((cur) => ({ ...cur, aiAnalysis: next }));
  startTransition(async () => {
    const res = await updateTrackAiAnalysis({
      trackId: track.id,
      recordId,
      text: next,
    });
    if (!res.ok) {
      setLocal((cur) => ({ ...cur, aiAnalysis: prev }));
      setError(res.error);
    }
  });
}
```

## Prop nova em `<TrackCurationRow>`

```ts
type Props = {
  // ... existentes ...
  aiConfigured: boolean; // NOVO
};
```

Page (`/disco/[id]/page.tsx`) passa o resultado de
`(await getUserAIConfigStatus(user.id)).configured`.
