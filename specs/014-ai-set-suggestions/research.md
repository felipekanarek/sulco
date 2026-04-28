# Research — Inc 1 (Briefing com IA)

## Decisão 1: formato JSON da resposta + parse defensivo

**Decisão**: instruir IA a retornar exclusivamente um array JSON
no formato `[{ "trackId": number, "justificativa": string }, ...]`
envolto em fences markdown ` ```json ... ``` `. Parse no servidor
extrai o **primeiro bloco** entre fences (regex `/```json\s*(\[[\s\S]*?\])\s*```/i`)
e valida via Zod. Se fences ausentes, fallback regex tenta achar
um array JSON top-level (`/(\[\s*\{[\s\S]*\}\s*\])/`).

**Rationale**:
- LLMs frequentemente envolvem JSON em prosa explicativa apesar
  da instrução. Parse robusto evita falsos negativos.
- Fences markdown ` ```json ` é o padrão mais comum e estável
  entre Gemini/Claude/GPT. Pedir explicitamente reduz variância.
- Zod no fim garante shape correto antes de chegar ao client.

**Schema Zod**:
```ts
const aiSuggestionsSchema = z.array(
  z.object({
    trackId: z.number().int().positive(),
    justificativa: z.string().min(1).max(500),
  })
).min(0).max(20);
```

**Alternativas consideradas**:
- **Function calling / tool use**: mais robusto mas providers
  diferentes têm APIs distintas (OpenAI tools, Anthropic tools,
  Gemini function calling) — quebra a abstração do adapter do
  Inc 14. Rejeitado.
- **JSON Mode** (OpenAI) / `response_mime_type: "application/json"`
  (Gemini): existe mas não está exposto uniformemente nos 5
  providers. Rejeitado pra manter adapter simples.
- **Output em CSV/YAML**: piora alinhamento com pattern já
  estabelecido do projeto. Rejeitado.

## Decisão 2: critério de "mais bem-curadas" pra truncamento

**Decisão**: score = soma de campos AUTHOR não-nulos (`bpm`,
`musicalKey`, `energy`, `moods.length > 0`, `contexts.length > 0`,
`comment != null`, `aiAnalysis != null`, `rating != null`,
`fineGenre != null`). Score máximo = 9. Empate desfeito por
`updatedAt DESC` (mais recente primeiro).

Aplicado em SQL via `ORDER BY` quando elegíveis > 50:

```sql
ORDER BY (
  CASE WHEN bpm IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN musical_key IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN energy IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN json_array_length(moods) > 0 THEN 1 ELSE 0 END +
  CASE WHEN json_array_length(contexts) > 0 THEN 1 ELSE 0 END +
  CASE WHEN comment IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN ai_analysis IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN fine_genre IS NOT NULL THEN 1 ELSE 0 END
) DESC, updated_at DESC
LIMIT 50
```

**Rationale**:
- IA performa melhor com contexto rico — faixa só com `artist +
  title` é quase ruído. BPM/tom/mood são o que torna sugestão útil.
- 9 campos AUTHOR cobrem todos os pontos curatoriais já
  estabelecidos. Ponderação simples (1 por campo) evita
  over-engineering.
- `updatedAt DESC` no desempate privilegia faixas vivas no acervo.

**Alternativas consideradas**:
- **Aleatório**: variedade entre clicks, mas perde foco em
  metadados ricos. Rejeitado pra MVP.
- **Híbrido (70% top-curated + 30% random)**: variedade +
  contexto. Mais código. Adiável pra evolução se DJ reclamar
  "IA sempre sugere as mesmas". MVP: simples.
- **Pré-ranking textual contra briefing**: implementa heurística
  custosa antes da IA. Overkill — a IA é exatamente quem deve
  fazer isso.

## Decisão 3: estender `queryCandidates` ou nova query?

**Decisão**: estender `queryCandidates` em
[src/lib/queries/montar.ts](../../src/lib/queries/montar.ts) com
parâmetro opcional `{ rankByCuration?: true; limit?: number }`.
Quando setado, aplica o ORDER BY do score (decisão 2) + LIMIT.
Sem isso, comportamento atual preservado (listagem manual em
`/montar` continua usando default).

**Rationale**:
- Evita duplicar a lógica complexa de filtros (text/bpm/key/
  energy/rating/moods/contexts/bomba) — `queryCandidates` já
  faz tudo isso.
- Inc 14 / Inc 13 já estabeleceram pattern de "estender função
  existente" (helper compartilhado). Coerente.

**Alternativas considerardas**:
- **Função separada `queryCandidatesForAI`**: duplica lógica de
  filtros. Rejeitado.
- **Reusar inline em `suggestSetTracks`**: idem.

## Decisão 4: posição visual do badge "✨ Sugestão IA" no card

**Decisão**: badge inline acima dos metadados (antes do BPM/tom/
mood chips), alinhado com pattern do projeto. Usa cores existentes
(borda `--accent`, texto `--accent`, `font-mono uppercase
tracking-[0.12em] text-[10px]`). Justificativa em itálico
abaixo dos metadados, dentro do mesmo card, antes do botão
"Adicionar ao set".

```tsx
{aiSuggestion ? (
  <span className="inline-block font-mono text-[10px] uppercase tracking-[0.12em] border border-accent text-accent px-2 py-0.5 mb-1">
    ✨ Sugestão IA
  </span>
) : null}
{/* ... metadados existentes ... */}
{aiSuggestion ? (
  <p className="font-serif italic text-[14px] text-ink-soft mt-2">
    {aiSuggestion.justificativa}
  </p>
) : null}
```

**Rationale**:
- Reusa tokens existentes (sem CSS novo).
- Badge proeminente acima sem destruir hierarquia visual.
- Justificativa em itálico (consistente com placeholder do Inc 13).

**Alternativas consideradas**:
- Badge dentro de algum metadado existente (BPM, etc): confunde.
- Card visualmente diferente (cor de fundo distinta): quebra DRY,
  contradiz Q2 da clarify.

## Decisão 5: estado client das sugestões

**Decisão**: `<AISuggestionsPanel>` mantém:

```ts
type AISuggestionView = {
  trackId: number;
  justificativa: string;
  added: boolean; // true quando DJ clicou "Adicionar ao set"
};

type PanelState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready'; suggestions: AISuggestionView[]; candidatesById: Map<number, Candidate> }
  | { kind: 'error'; message: string };
```

`candidatesById` é cache do catálogo que veio do server (action
retorna sugestões + candidatos completos pra UI renderizar sem
re-query). `added` flag muda de `false` → `true` ao adicionar; o
card permanece visível mas com style "✓ adicionada" (FR-008).

**Rationale**:
- Action retorna cards completos (não só `trackId`); evita roundtrip
  extra pra cada sugestão.
- Estado simples (sem reducer/zustand) — `useState` basta.
- Reset ao re-gerar (com confirmação se `suggestions` tem `added=false`).

**Alternativas consideradas**:
- Action retorna só `[{trackId, justificativa}]` e client busca
  candidato via outra query: roundtrip extra desnecessário.
- Persistir sugestões no DB: overkill, sugestões são efêmeras.

## Decisão 6: tratamento de catálogo elegível vazio

**Decisão**: ANTES de chamar provider, conferir tamanho do catálogo.
Se 0, retornar imediatamente:

```ts
if (candidates.length === 0) {
  return {
    ok: false,
    error: 'Nenhum candidato elegível com os filtros atuais. Relaxe os filtros e tente de novo.',
  };
}
```

Sem chamada à IA = zero tokens consumidos (FR-011, SC-006).

**Rationale**:
- Custo zero pro DJ em situação inútil.
- Mensagem direciona ação ("relaxe os filtros").
- Servidor confere antes de payload da IA.

## Decisão 7: timeout 60s + reuso de `enrichTrackComment`

**Decisão**: `Promise.race([enrichTrackComment(...), setTimeout(60_000)])`
em `suggestSetTracks`. 60s é mais generoso que Inc 13 (30s) por
causa de:
- Prompt maior (briefing + set + 50 candidatos = ~4k tokens)
- Output maior (5-10 sugestões com justificativa = ~1.5k tokens)
- Modelos thinking (Gemini 2.5) podem demorar mais com prompts ricos

**Rationale**:
- Vercel hobby tem limite de 60s no Server Action — usamos esse
  ceiling como timeout pra falhar antes de o runtime matar.
- Mais permissivo que Inc 13 mas ainda controla UX (DJ não espera
  >1min).

## Decisão 8: instrução do prompt — JSON only + estrutura

**Decisão**: L4 instrução pede:
```
Retorne EXCLUSIVAMENTE um array JSON com 5-10 objetos, no formato:

```json
[
  {"trackId": 123, "justificativa": "Casa com X por Y"},
  ...
]
```

NÃO escreva nada antes ou depois do bloco JSON. Cada justificativa
em pt-BR, 1-2 frases curtas, perspectiva técnica de DJ. Use trackIds
APENAS do "Catálogo elegível" (L3) — não invente IDs. Não sugira
faixas que já estão em "Faixas atuais do set" (L2). Priorize
diversidade quando possível (não 5 sugestões do mesmo artista).
```

**Rationale**:
- "EXCLUSIVAMENTE um array JSON" reduz prosa envolvente.
- Bloco em fences markdown estabilizado entre providers.
- Cada constraint anti-hallucination explícita (trackIds reais,
  não duplicar set atual).
- Justificativa curta força foco; "perspectiva técnica" reusa
  vocabulário já calibrado no Inc 13 (sem repetir buzzwords
  proibidos).
