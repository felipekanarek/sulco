# Data Model — Inc 1

## Schema delta

**Nenhum.** Reusa entidades existentes:

- **`sets`** — `briefing`, `montarFiltersJson`, `userId`
- **`set_tracks`** — junção set-track com `order`
- **`tracks`** — filtra por `selected=true` + campos AUTHOR
  (`bpm`, `musicalKey`, `energy`, `moods`, `contexts`, `comment`,
  `aiAnalysis`, `rating`, `fineGenre`)
- **`records`** — multi-user isolation, filtros de gênero/estilo
- **`users`** — config de IA (`aiProvider`, `aiModel`, `aiApiKeyEncrypted` do Inc 14)

## Estado client (não persistido)

### `AISuggestionView`

```ts
type AISuggestionView = {
  trackId: number;
  justificativa: string;
  added: boolean;
};
```

`added` muda de `false` → `true` quando DJ clica "Adicionar ao set"
no card. Card permanece visível com flag visual; nunca volta pra
`false` (DJ não pode "des-adicionar" via card de sugestão — pra isso
usa a UI de bag/set existente).

### `PanelState`

```ts
type PanelState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'ready';
      suggestions: AISuggestionView[];
      candidatesById: Map<number, Candidate>;
    }
  | { kind: 'error'; message: string };
```

`candidatesById` é cache do batch de candidatos que veio do server
junto com as sugestões. Permite renderizar `<CandidateRow>` com
metadados completos sem nova query.

## Side-effects

### `suggestSetTracks(setId)` — Server Action nova

- **Lê**: set (briefing, montarFiltersJson), tracks em set_tracks,
  catálogo elegível via `queryCandidates(userId, filters, inSetIds, { rankByCuration: true, limit: 50 })`.
- **Chama**: `enrichTrackComment(userId, prompt)` com
  `Promise.race(60s)`.
- **Não escreve nada no DB.** Apenas retorna sugestões pro client.
- **Não revalida path** (resposta é volátil, depende de chave do
  user).

### `addTrackToSet(setId, trackId)` — Server Action existente

Reusada sem mudança. Cada clique em "Adicionar ao set" no card
de sugestão dispara essa action.

- **Lê**: ownership (set + track pertencem ao user).
- **Escreve**: insere row em `set_tracks` com `order` incrementado.
- **Revalida**: `/sets/[id]/montar`.

## Invariantes

- **Multi-user isolation**: `suggestSetTracks` filtra `set.userId
  === user.id`; `queryCandidates` já filtra `records.userId ===
  user.id`. IA não vê faixas de outro DJ.
- **Catálogo nunca vazio chama IA**: validação ANTES da chamada
  ao provider (FR-011).
- **Sugestões filtradas server-side**: trackIds que (a) não
  existem no catálogo elegível, (b) já estão em set_tracks são
  removidos antes de retornar (anti-hallucination + anti-duplicação
  defensiva).
- **Sem persistência de sugestões**: cada geração é fresh. Re-clicar
  substitui a lista anterior (com confirmação se há `added=false`).
