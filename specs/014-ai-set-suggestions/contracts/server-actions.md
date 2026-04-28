# Server Actions — Contratos

## `suggestSetTracks` (nova)

### Assinatura

```ts
export async function suggestSetTracks(input: {
  setId: number;
}): Promise<
  ActionResult<{
    suggestions: { trackId: number; justificativa: string }[];
    candidates: Candidate[]; // batch que veio do queryCandidates (pra UI renderizar)
  }>
>;
```

### Validação Zod

```ts
const suggestInputSchema = z.object({
  setId: z.number().int().positive(),
});
```

### Comportamento

1. `requireCurrentUser` → user.
2. Parse Zod.
3. **Ownership**: `db.select().from(sets).where(and(eq(sets.id, setId), eq(sets.userId, user.id))).limit(1)`. Sem resultado → `{ ok: false, error: 'Set não encontrado.' }`.
4. Carrega faixas do set via `listSetTracks(setId, user.id)`. Lista compacta `{ trackId, position, artist, title }`.
5. Parse `montarFiltersJson` do set (default `{}`).
6. Identifica trackIds já no set: `inSetIds = setTracks.map(t => t.trackId)`.
7. Carrega catálogo elegível: `queryCandidates(user.id, filters, inSetIds, { rankByCuration: true, limit: 50 })`. Retorna `Candidate[]`.
8. **Curto-circuito**: se `candidates.length === 0` → `{ ok: false, error: 'Nenhum candidato elegível com os filtros atuais. Relaxe os filtros e tente de novo.' }` (sem chamar IA — FR-011).
9. Monta prompt via `buildSetSuggestionsPrompt({ briefing, setTracks, candidates })` (helper em `src/lib/prompts/set-suggestions.ts`).
10. `Promise.race([enrichTrackComment(user.id, prompt), timeout(60_000)])`.
11. Em erro/timeout: propaga mensagem contextual.
12. **Parse JSON defensivo** via `parseAISuggestionsResponse(text)`. Falha de parse → `{ ok: false, error: 'IA retornou resposta em formato inesperado — tente novamente.' }`.
13. **Filtragem defensiva** (anti-hallucination):
    - Remove trackIds que não estão em `candidates` (IA inventou).
    - Remove trackIds que estão em `inSetIds` (IA ignorou regra).
    - Remove duplicatas dentro do array.
    - Trunca em max 10 (caso IA retorne 20+).
14. Se filtragem zera → `{ ok: false, error: 'IA não retornou sugestões válidas — tente novamente.' }`.
15. Return `{ ok: true, data: { suggestions, candidates } }`.

### Output

`ActionResult` com `suggestions` (lista filtrada) + `candidates`
(batch completo, pra UI montar cards). Cliente cacheia
`candidates` em `Map<number, Candidate>` pra render.

### Erros possíveis

| Causa | Mensagem |
|---|---|
| Set não pertence ao user | "Set não encontrado." |
| Catálogo elegível vazio | "Nenhum candidato elegível com os filtros atuais. Relaxe os filtros e tente de novo." |
| IA sem config (Inc 14) | "Configure sua chave em /conta antes de usar IA." (vinda do `enrichTrackComment`) |
| IA retornou erro (key inválida, rate limit, etc) | Mensagem do `AdapterError` mapeado pelo Inc 14 |
| Timeout 60s | "Provider não respondeu — tente novamente." |
| Parse JSON falhou | "IA retornou resposta em formato inesperado — tente novamente." |
| Sugestões todas inválidas pós-filtro | "IA não retornou sugestões válidas — tente novamente." |

### Não-funcionais

- Timeout 60s (Promise.race).
- Sem `revalidatePath` — resposta é volátil.
- Não escreve nada no DB.

## `queryCandidates` (existente, **estendido**)

### Antes

```ts
export async function queryCandidates(
  userId: number,
  filters: MontarFilters,
  inSetIds: number[] = [],
): Promise<Candidate[]>;
```

### Depois

```ts
export async function queryCandidates(
  userId: number,
  filters: MontarFilters,
  inSetIds: number[] = [],
  opts?: { rankByCuration?: boolean; limit?: number },
): Promise<Candidate[]>;
```

### Comportamento adicional

Quando `opts?.rankByCuration === true`:
- Adiciona ORDER BY com score de campos AUTHOR preenchidos
  (decisão 2 do [research.md](../research.md)).
- Empate desfeito por `tracks.updatedAt DESC`.

Quando `opts?.limit > 0`:
- Aplica `LIMIT` no fim.

**Compat**: chamadas atuais do `<Montar>` (UI manual) NÃO passam
`opts` — mantêm comportamento default (sem rank, sem limit).

## `addTrackToSet` (existente, **sem mudança**)

Reusada pelo `<AISuggestionsPanel>` quando DJ clica "Adicionar ao
set" em um card de sugestão. Já valida ownership e adiciona com
`order` incrementado.
