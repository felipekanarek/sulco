# Data Model — Inc 16

## Schema delta

**Nenhum.** Reusa entidades existentes.

## Estado client (não persistido)

### `<MontarCandidates>` state

```ts
type SuggestionsState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'ready';
      suggestions: Array<{ trackId: number; justificativa: string }>;
      candidatesById: Map<number, Candidate>;
    }
  | { kind: 'error'; message: string };
```

Mesma forma do Inc 14, agora dentro de `<MontarCandidates>` em vez
do `<AISuggestionsPanel>` removido.

### Lista derivada (computada no render)

Quando `state.kind === 'ready'`:
```ts
const suggestedIds = new Set(state.suggestions.map(s => s.trackId));
const suggestedCards = state.suggestions
  .map(s => ({ candidate: state.candidatesById.get(s.trackId), justificativa: s.justificativa }))
  .filter(x => x.candidate !== undefined);
const commonCards = candidates.filter(c => !suggestedIds.has(c.id));
```

Render: `[...suggestedCards, ...commonCards]` em uma `<ol>`.

Quando state ≠ ready: render = `candidates` original sem dedup.

## Side-effects

### `<MontarCandidates>` handlers

- `handleSuggest()`:
  - Se ready com >0 sugestões: `window.confirm` (Inc 14 pattern preservado).
  - `setState({ kind: 'generating' })` + chamar `suggestSetTracks({ setId })`.
  - Em sucesso: `setState({ kind: 'ready', suggestions, candidatesById })`.
  - Em erro: `setState({ kind: 'error', message })`.

- `handleIgnore()`:
  - `setState({ kind: 'idle' })`.
  - Sem confirmação. Sem chamada server.

### Adicionar sugestão (`<CandidateRow>` existente)

Sem mudança. `<CandidateRow>` já chama `addTrackToSet` internamente.
Após sucesso, marca `inSet=true` localmente e mantém card visível.
Inc 16 não altera este fluxo.

## Invariantes

- **Cada trackId aparece visualmente apenas uma vez**: dedup via
  `Set<number>` antes do render (FR-002a).
- **Sugestões dentro do bloco sugerido preservam ordem da IA**: o
  array `state.suggestions` é renderizado na ordem em que veio do
  `suggestSetTracks` (que já é a ordem da IA, com filtragem
  defensiva mantendo posições).
- **Candidatos comuns preservam ordem original** (rating DESC, artist
  ASC, position ASC — definida no `queryCandidates` quando rankByCuration=false).
- **Reset em "Ignorar" é idempotente**: chamar 2× em sequência é no-op.
