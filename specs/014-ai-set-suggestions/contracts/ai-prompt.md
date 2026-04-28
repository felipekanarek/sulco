# AI Prompt — Estrutura + Parse

Helper em `src/lib/prompts/set-suggestions.ts`.

## Função `buildSetSuggestionsPrompt`

### Assinatura

```ts
export function buildSetSuggestionsPrompt(input: {
  briefing: string | null;
  setName: string;
  eventDate: Date | null;
  location: string | null;
  setTracks: Array<{
    artist: string;
    title: string;
    position: string;
  }>;
  candidates: Candidate[]; // do queryCandidates
}): string;
```

### Output (multi-linha)

```
=== L1: Briefing do set ===
Nome: <setName>
Data: <eventDate || "(não definida)">
Local: <location || "(não definido)">

Briefing: <briefing || "(sem briefing — usar metadados como única referência)">

=== L2: Faixas atualmente no set ({N}) ===
- {artist1} - {title1} ({position1})
- {artist2} - {title2} ({position2})
...
{ou "(set vazio — primeira sugestão)" se setTracks.length === 0}

=== L3: Catálogo elegível ({M} candidatos) ===
trackId={id1} | {artist} - {title} ({position}) | {Gêneros} | {Estilos} | BPM={bpm||"?"} | Tom={key||"?"} | Energia={energy||"?"}/5 | Mood={moods.join(",")||"?"} | Contexto={contexts.join(",")||"?"} | {comment? "Comentário: "+comment.slice(0,80) : ""} | {aiAnalysis? "Análise: "+aiAnalysis.slice(0,120) : ""}
trackId={id2} | ...
...

=== L4: Instrução ===
Você é um DJ experiente analisando um set em construção. Sugira
faixas do "Catálogo elegível" (L3) que **complementem** as faixas
atuais (L2) e atendam ao briefing (L1).

Retorne EXCLUSIVAMENTE um array JSON com 5-10 objetos, no formato:

\`\`\`json
[
  {"trackId": 123, "justificativa": "Casa com X por Y"},
  {"trackId": 456, "justificativa": "..."}
]
\`\`\`

NÃO escreva nada antes ou depois do bloco JSON.

Regras:
- Use trackIds APENAS do "Catálogo elegível" — não invente IDs.
- NÃO sugira faixas que já estão em "Faixas atuais" (L2).
- Cada justificativa em pt-BR, 1-2 frases curtas, perspectiva
  técnica de DJ (uso em set, BPM/tom relevantes, sonoridades que
  dialogam com o briefing ou com faixas atuais).
- Priorize diversidade — não repita o mesmo artista 5 vezes.
- Se catálogo for muito pequeno e fizer sentido só sugerir 3-4,
  retorne menos. Mínimo 0 (array vazio se nada se aplica).
```

### Tamanho estimado (acervo médio)

- L1: ~500 chars
- L2 (60 faixas): ~5.000 chars / ~1.500 tokens
- L3 (50 candidatos com metadados ricos): ~7.500 chars / ~2.500 tokens
- L4: ~600 chars

**Total**: ~13.600 chars / ~4.300 tokens. Comfortável em qualquer
provider (Gemini 1M, Claude 200k, GPT 128k).

## Função `parseAISuggestionsResponse`

### Assinatura

```ts
export function parseAISuggestionsResponse(text: string): {
  ok: true;
  data: Array<{ trackId: number; justificativa: string }>;
} | { ok: false; error: string };
```

### Comportamento

1. Tenta extrair bloco entre fences markdown:
   ```ts
   const fenced = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i);
   ```
2. Se não houver fences, tenta achar primeiro array JSON top-level:
   ```ts
   const inline = text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
   ```
3. Se nenhum match → `{ ok: false, error: 'Resposta sem bloco JSON detectável.' }`.
4. Tenta `JSON.parse` no match. Falha → `{ ok: false, error: 'JSON inválido.' }`.
5. Valida via Zod:
   ```ts
   const aiSuggestionsSchema = z.array(
     z.object({
       trackId: z.number().int().positive(),
       justificativa: z.string().min(1).max(500),
     })
   ).min(0).max(20);
   ```
6. Retorna `{ ok: true, data }`.

### Edge cases cobertos

- IA envolve JSON em prosa (`Aqui estão as sugestões: \`\`\`json [...] \`\`\` Espero ter ajudado!`) → fenced match pega.
- IA esquece fences mas retorna array puro → inline match pega.
- IA retorna objeto único `{trackId, justificativa}` em vez de array → schema falha (rejeitado, força regenerar).
- IA retorna array vazio `[]` → válido, retorna `[]` (UI mostra "Nenhuma sugestão" + opção re-gerar).
- IA retorna trackId como string → Zod coerce não tenta; falha. Aceitável (anti-fragilidade dos tipos).

### Não testa: ownership / existência no catálogo

`parseAISuggestionsResponse` valida só formato. Filtragem de
hallucination + duplicação fica no `suggestSetTracks` (passo 13
do server-actions.md), com acesso ao `candidates` real.
