# Research — Inc 10 (Curadoria aleatória respeita filtros)

## Decisão 1: extrair `buildCollectionFilters` de `queryCollection`

**Decisão**: extrair a lógica de construção de WHERE conditions de
`queryCollection` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts)
para um helper interno `buildCollectionFilters(q)`. Tanto
`queryCollection` quanto `pickRandomUnratedRecord` (refatorada) usam
o mesmo helper. Garante FR-004 (semântica idêntica) por construção.

**Rationale**:
- A lógica de filtros é ~30 linhas (texto, genres, styles, bomba) com
  casos de borda (json_each para genres/styles, exists para bomba).
  Duplicar é pedir bug de divergência futura.
- Helper retorna `SQL[]` (array de conditions). Caller faz
  `and(...conds)` com seus filtros base (`status`, `archived`, etc.).
- Tipo do input: `Pick<CollectionQuery, 'text' | 'genres' | 'styles' | 'bomba'>`
  — só os filtros refinos, não os filtros base de `userId`/`status`.
- Para `pickRandomUnratedRecord`, os filtros base são fixos:
  `userId`, `archived=false`, `status='unrated'`. Para `queryCollection`,
  são `userId`, `archived=false`, `status` (variável).

**Alternativas consideradas**:
- **Refatorar `queryCollection` para aceitar `selectColumns` opcional**
  e fazer `pickRandomUnratedRecord` chamar diretamente: complica a
  função existente (que devolve agregações de tracks). Não vale.
- **Inline na nova action**: viola DRY, garante drift futuro entre
  listagem e sorteio.

## Decisão 2: status filter da URL é ignorado pelo sorteio

**Decisão**: `pickRandomUnratedRecord` força `status='unrated'`
internamente, ignorando qualquer `status` que venha do client. Spec
FR-002 confirma.

**Rationale**:
- O botão é "Curar disco aleatório" — semanticamente significa
  "sortear pra triar", o que implica não-avaliados.
- Se DJ está em `?status=active` e clica 🎲, faz sentido cair num
  unrated do mesmo recorte de gênero/estilo (não num active aleatório
  — esse não é o caso de uso).
- Se evolução futura exigir "sortear active de um estilo", abrir spec
  separada com novo botão.

**Alternativas consideradas**:
- **Aceitar status do client**: muda semântica do botão. Rejeitado.
- **Esconder o botão quando `status !== 'unrated'`**: piora UX (DJ
  perde acesso à triagem). Rejeitado.

## Decisão 3: filtros lidos como prop server-side, passados pro client

**Decisão**: a home (`page.tsx`) já parseia searchParams (status,
text, bomba, genres, styles). Passar esses valores como prop pro
`<RandomCurationButton>`. Botão envia direto pra Server Action
sem reler URL.

**Rationale**:
- `<RandomCurationButton>` é client component (já é hoje). Reler
  searchParams via `useSearchParams()` exigiria nova dependência e
  duplicaria parsing. Passar como prop é trivial.
- Alinhado com o padrão atual do projeto: `<FilterBar>` também
  recebe filtros como prop (não usa `useSearchParams`).
- Server Action recebe input explícito (mais testável, valida com
  Zod antes de aplicar SQL).

**Alternativas consideradas**:
- **`useSearchParams` no botão**: re-fetch desnecessário, não há
  ganho concreto, e o componente perde o caráter "sem estado próprio".
- **Server Action lê headers/cookies**: gambiarra, piora isolamento.

## Decisão 4: validação Zod do input da action

**Decisão**: schema Zod no input da action:
```ts
const filtersSchema = z.object({
  text: z.string().trim().default(''),
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  bomba: z.enum(['any', 'only', 'none']).default('any'),
}).optional();
```
Default `undefined` mantém compat (chamada sem args = comportamento
atual).

**Rationale**:
- Padrão do projeto: todas as Server Actions com input não-trivial
  validam com Zod (Princípio II, constituição).
- `.optional()` no schema externo + `.default()` em cada campo cobre
  caller que passa `{ text: 'foo' }` (sem genres) sem reclamar.
- Inputs inválidos viram `{ ok: false, error: '...' }` — tratado
  pelo client da mesma forma que outros erros.

## Decisão 5: empty state contextual

**Decisão**: `<RandomCurationButton>` passa a ter 2 estados de empty:
- `emptyContext: 'global'` — sem filtros, 0 unrated → "Não há discos
  pra triar — todos já foram avaliados." (mensagem original).
- `emptyContext: 'filtered'` — com filtros, 0 elegíveis → "Nenhum
  disco unrated com esses filtros."

Decisão é client-side: o componente sabe se passou filtros não-vazios
pra action. Se passou e action voltou `recordId: null`, mostra
mensagem `'filtered'`. Sem filtros e null → mensagem `'global'`.

**Rationale**:
- Server Action não precisa saber de copy — é lógica de UI.
- Detectar "tem filtros ativos" no client é trivial (qualquer string
  não-vazia / array não-vazio / bomba !== 'any').

**Alternativas consideradas**:
- **Server Action devolve flag `hadFilters`**: redundante, client já
  sabe o que enviou.
- **Mensagem única genérica** ("Nenhum disco encontrado"): perde a
  diferenciação de causa (acervo todo avaliado vs filtro estreito).
  Rejeitado por SC-003.
