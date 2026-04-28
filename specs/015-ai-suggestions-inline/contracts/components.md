# Components — Contratos

## `<MontarCandidates>` (NOVO)

### Props

```ts
type Props = {
  candidates: Candidate[];      // do server (RSC carrega via queryCandidates)
  inSetIds: number[];           // do server (listSetTracks)
  setId: number;
  aiConfigured: boolean;        // do server (getUserAIConfigStatus)
};
```

### Responsabilidades

1. Header com título "Candidatos" + contador + botões "Sugerir com IA" / "Ignorar sugestões".
2. Estado client de sugestões (`SuggestionsState`).
3. Renderizar `<ol>` única com sugestões deduplicadas no topo + candidatos comuns embaixo.
4. Wire-up dos handlers `handleSuggest` (chama `suggestSetTracks`) e `handleIgnore` (reset state).

### Render

```tsx
'use client';

export function MontarCandidates({
  candidates,
  inSetIds,
  setId,
  aiConfigured,
}: Props) {
  const [state, setState] = useState<SuggestionsState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  const inSetIdsSet = useMemo(() => new Set(inSetIds), [inSetIds]);
  const isReady = state.kind === 'ready';
  const isGenerating = state.kind === 'generating';

  // Lista derivada
  const { suggestedCards, commonCards } = useMemo(() => {
    if (state.kind !== 'ready') {
      return { suggestedCards: [], commonCards: candidates };
    }
    const suggestedIds = new Set(state.suggestions.map((s) => s.trackId));
    const suggested = state.suggestions
      .map((s) => {
        const candidate = state.candidatesById.get(s.trackId);
        return candidate ? { candidate, justificativa: s.justificativa } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const common = candidates.filter((c) => !suggestedIds.has(c.id));
    return { suggestedCards: suggested, commonCards: common };
  }, [state, candidates]);

  function handleSuggest() {
    if (isReady && state.suggestions.length > 0) {
      const ok = window.confirm(`Substituir as ${state.suggestions.length} sugestão(ões) atuais por uma nova lista?`);
      if (!ok) return;
    }
    setState({ kind: 'generating' });
    startTransition(async () => {
      const res = await suggestSetTracks({ setId });
      if (res.ok && res.data) {
        const candidatesById = new Map(res.data.candidates.map((c) => [c.id, c]));
        setState({ kind: 'ready', suggestions: res.data.suggestions, candidatesById });
      } else if (!res.ok) {
        setState({ kind: 'error', message: res.error });
      }
    });
  }

  function handleIgnore() {
    setState({ kind: 'idle' });
  }

  // Header + lista...
}
```

### Estados visuais

- **idle**: header com botão "Sugerir com IA" (disabled se !aiConfigured). Lista mostra `candidates` sem destacados.
- **generating**: botão diz "Sugerindo…" e fica disabled. Lista permanece visível (não some). Sugestões anteriores (se havia) permanecem até resposta.
- **ready com 0 sugestões**: mensagem inline "Nenhuma sugestão válida — tente novamente." + botão "Sugerir com IA" reativado. Sem botão "Ignorar".
- **ready com >0 sugestões**: header com 2 botões ("Sugerir com IA" reativado pra re-gerar + "Ignorar sugestões" novo). Lista mostra sugestões deduplicadas no topo + comuns embaixo.
- **error**: mensagem `role="alert"` com `state.message`. Botão "Sugerir" volta habilitado. Lista não muda.

## `<CandidateRow>` — extensão visual

### Props (sem mudança de assinatura)

```ts
{
  candidate: Candidate;
  setId: number;
  alreadyIn: boolean;
  aiSuggestion?: { justificativa: string };
}
```

### Mudança visual quando `aiSuggestion` está presente

**Container** (root `<article>` do row):
- Ganha classes adicionais: `border-2 border-accent/60 bg-paper-raised p-3 md:p-4 mb-2 rounded-sm`.
- Quando ausente, mantém comportamento atual (sem moldura, padding default, sem mb).

**Badge** (já existe no Inc 14, refator visual):
- Antes: `border border-accent text-accent` (outline).
- Depois: `bg-accent text-paper px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] font-mono` (solid).

**Justificativa** (já existe no Inc 14, refator visual):
- Antes: `font-serif italic text-[14px] text-ink-soft`.
- Depois: `font-serif italic text-[15px] text-ink leading-relaxed mt-2`.

### Compat

- `<CandidateRow>` sem prop `aiSuggestion` mantém aparência idêntica à atual.
- Comportamento de adicionar/remover no `<CandidateRow>` permanece intacto (lógica interna de `add()` / `remove()`).

## `<AISuggestionsPanel>` — REMOVIDO

Arquivo `src/components/ai-suggestions-panel.tsx` deletado.

## `/sets/[id]/montar/page.tsx` — refator de JSX

### Antes

```tsx
{set.briefing ? <BriefingBlock /> : null}
<AISuggestionsPanel setId={setId} aiConfigured={aiConfigured} />
<details>...filtros mobile...</details>
<div className="hidden md:block"><MontarFiltersForm /></div>
<section>
  <h2>Candidatos</h2>
  <ol>{candidates.map((c) => <CandidateRow ... />)}</ol>
</section>
```

### Depois

```tsx
{set.briefing ? <BriefingBlock /> : null}
<details>...filtros mobile...</details>
<div className="hidden md:block"><MontarFiltersForm /></div>
<MontarCandidates
  candidates={candidates}
  inSetIds={Array.from(inSetIds)}
  setId={setId}
  aiConfigured={aiConfigured}
/>
```

`<MontarCandidates>` absorve o `<section>` "Candidatos" + a chamada
ao `<AISuggestionsPanel>` antigo. Header + listagem viram um único
componente.
