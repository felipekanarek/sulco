# Research — Inc 18: Busca insensitive a acentos

**Feature**: 021-accent-insensitive-search
**Date**: 2026-04-30

Decisões de design tomadas antes de Phase 1.

---

## Decisão 1 — JS-side post-query (não schema delta)

**Decision**: filtrar diacríticos em **JavaScript no RSC após
query SQL**, não em coluna física pré-normalizada.

**Rationale**:
- Escala atual: 1 user com ~2500 records / ~10k tracks. Carregar
  e filtrar em memória ~2500 strings é trivial em performance
  (poucos ms; alguns KB de RAM).
- Zero schema delta: cumpre Princípio III com mínima fricção.
  Sem migração, sem backfill, sem manter sincronia em sync/writes.
- SQLite/Turso não tem `unaccent` nativo nem `load_extension`,
  então SQL puro está fora.
- Escala futura: se passar de ~5k records ou ~50k tracks por
  user, abrir Inc futuro pra schema delta com `search_blob`
  físico + backfill + manutenção em writes. Custo > benefício
  hoje.

**Alternatives considered**:
- **Schema delta `search_blob` em records/tracks**: rejeitado por
  ora — custo de implementação + manutenção alto pra uso solo.
  Será o caminho quando virar gargalo.
- **SQLite extension** (ex: `icu`): rejeitado — Turso não permite
  `load_extension` em prod.
- **Post-process em client (browser)**: rejeitado — exigiria
  carregar todos os fields textuais no client; viola Princípio
  Server-First; UX pior (RSC cuida disso melhor).

---

## Decisão 2 — Algoritmo de normalização

**Decision**: `s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')`.

**Rationale**:
- `normalize('NFD')` decompõe `é` em `e + ́` (combining acute
  accent). Universal: cobre pt-BR, espanhol, francês, alemão,
  vietnamita, etc.
- `\p{M}` (Unicode property `Mark`) com flag `u` mata QUALQUER
  combining mark. Mais robusto que range hexadecimal `̀-ͯ`
  (cobre apenas Latin-1 Supplement) — `\p{M}` cobre marks de
  todos os blocos Unicode incluindo árabe, hebraico, devanagari.
- `toLowerCase()` antes da decomposição — assegura case-insensitive
  cumulativo (Decisão 3 da spec edge cases).

**Alternatives considered**:
- **Range hexadecimal `[̀-ͯ]`**: funciona pra acentos
  latinos comuns mas pode passar marks de outros scripts. `\p{M}`
  é equivalente em casos pt-BR e mais robusto pra outros idiomas.
- **Pacote npm `diacritics` ou `unidecode`**: rejeitado —
  dependência nova pra ~10 linhas de JS nativo.
- **`replace` específico de pt-BR (`á → a`, `é → e`...)**:
  rejeitado — opinionated; quebra usuários com nomes de outros
  idiomas; mais código pra manter.

---

## Decisão 3 — Bidirecional (normaliza ambos os lados)

**Decision**: tanto o termo digitado quanto cada valor do DB são
normalizados antes da comparação. Não há "lado canônico".

**Rationale**:
- Spec FR-003 explicitamente exige bidirecionalidade: "Digitar
  `joao` acha `João`; digitar `João` acha `Joao` (caso de
  cadastro inconsistente)".
- Aplicar normalize só em um lado quebra paridade. Ex: se só
  normalizar termo, "João" digitado vira "joao" e busca por LIKE
  acharia apenas valores `joao` no DB — perderia "João" do DB.
- Custo é negligível: 1 chamada extra de `normalize` por valor
  no resultado (~2500 chamadas por busca = poucos ms).

**Alternatives considered**:
- **Só normalizar query (DB lado intacto)**: rejeitado — quebra
  bidirecionalidade.
- **Só normalizar DB (query intacta)**: idem; quebra inverso.

---

## Decisão 4 — Separar text-filter em duas etapas (SQL não-text + JS text)

**Decision**: as queries `queryCollection` e `queryCandidates`
deixam de incluir o filtro `text` no SQL. Aplicam apenas filtros
não-textuais (status, archived, genres, styles, bomba, bpm,
energy, etc.) no SQL. Sobre o resultado, aplicam filtro de texto
em JS usando `normalizeText`.

**Implementação**:
- `buildCollectionFilters` ganha parâmetro opcional `omitText?:
  boolean` (default `false` para preservar callsites externos
  intactos no contrato).
- `queryCollection` chama com `omitText: true`, depois filtra
  resultado em JS.
- `queryCandidates` faz mudança análoga inline (não usa
  `buildCollectionFilters`).
- `pickRandomUnratedRecord` (Inc 11) precisa de adaptação
  específica — ver Decisão 5.

**Rationale**:
- Preserva ordering SQL (`ORDER BY desc(records.importedAt)` na
  collection; `ORDER BY rating, artist, position` em candidates).
- Filter JS preserva ordem do SQL — apenas remove rows que não
  match.
- Mantém `buildCollectionFilters` reusável e backward-compatible
  (callsites antigos continuam funcionando).

**Alternatives considered**:
- **Remover `q.text` totalmente do `buildCollectionFilters`**:
  rejeitado — mudança de contrato; outros callsites
  (`pickRandomUnratedRecord`) precisariam adaptar de qualquer
  jeito, e o flag default mantém zero ruído pros callers.
- **Aplicar JS filter dentro do `buildCollectionFilters`**:
  rejeitado — função retorna `SQL[]`; misturaria responsabilidades.

---

## Decisão 5 — `pickRandomUnratedRecord`: SQL non-text → JS post-filter → JS random

**Decision**: action carrega IDs + fields textuais relevantes
(artist, title, label) com filtros não-text aplicados via SQL,
filtra em JS por text normalizado, e escolhe random JS sobre o
resultado filtrado.

**Rationale**:
- Hoje a query usa `ORDER BY RANDOM() LIMIT 1` pra escolher row
  aleatório direto no SQL — eficiente mas amarra text filter ao
  SQL. Não dá pra mover pra post-filter sem perder a
  aleatoriedade verdadeira (post-filter de 1 row = sem random).
- Solução: SQL retorna *todos* os IDs+textuais que satisfazem
  filtros não-text → JS aplica text filter → JS escolhe um
  uniformly random com `Math.random()`.
- ~2500 IDs+textuais em memória é poucos KB. Performance
  imperceptível.

**Alternatives considered**:
- **Manter SQL com text filter accent-sensitive em random**:
  rejeitado — DJ digita "joao" como filtro de busca, clica
  random, pode não voltar disco que ele esperava. Inconsistência
  semântica entre listagem e random na mesma rota.
- **Random no SQL com text filter via subquery normalize**:
  rejeitado — SQLite não tem unaccent; inviável.

---

## Decisão 6 — `queryCandidates`: mover `limit` pro pós-filter JS

**Decision**: o `opts.limit ?? 300` atual aplicado no SQL move
pra JS, depois do text filter.

**Rationale**:
- Se aplicarmos limit SQL antes do text filter, podemos perder
  candidatos válidos que foram filtrados pelo limit.
- Solução: SQL retorna *todos* os candidatos elegíveis (sem
  text/limit), JS filtra por text e aplica `slice(0, limit)`.
- Inc 14 (`suggestSetTracks`) usa `rankByCuration: true` com
  `limit: 50` — pattern continua funcionando.
- Pra escala atual (~10k tracks), unbounded SQL retorna alguns
  milhares no pior caso. Aceitável.

**Alternatives considered**:
- **Limit SQL alto (ex: 1000) + JS filter+slice**: rejeitado —
  arbitrário; acrescenta código sem benefício significativo
  enquanto a escala atual permite unbounded.
- **Manter limit SQL antes do text filter**: rejeitado — bug
  garantido (resultado sub-set incompleto quando text filter ativo).

---

## Decisão 7 — Helper auxiliar `matchesNormalizedText`

**Decision**: além do `normalizeText(s)`, expor função helper
`matchesNormalizedText(haystacks: (string | null | undefined)[],
query: string): boolean` que normaliza ambos os lados e retorna
se algum dos haystacks contém o query normalizado.

**Rationale**:
- DRY nos 3 callsites — em vez de cada query escrever
  `normalizeText(row.x).includes(normalizedQuery) ||
  normalizeText(row.y).includes(normalizedQuery) || ...`, chama
  `matchesNormalizedText([row.x, row.y, row.z], query)`.
- Lida com `null/undefined` de fields opcionais (label,
  fineGenre) sem ramos `if`.
- Pre-normaliza query 1 vez; haystacks normalizados a cada call.
  Ok pra escala atual.

**Alternatives considered**:
- **Inline em cada callsite**: rejeitado — duplicação
  desnecessária.
- **Função que recebe array + index**: rejeitado — interface mais
  desajeitada.

---

## Decisão 8 — Aplicar normalize em filtros de tag (mood/context/fineGenre/genres/styles)

**Decision**: spec FR-006 exige aplicar normalização em filtros
de tag. Mas tags hoje são comparadas via `value IN (?)` (igualdade
exata) ou `EXISTS (json_each ...)`. Normalize requer mudança de
estratégia de comparação.

**Decision específica**:
- Para `genres`/`styles` em `queryCollection`: SQL `EXISTS
  json_each value IN ?` permanece (compara igualdade exata após
  normalize do termo). DJ tipicamente seleciona valores de uma
  lista de sugestões, então igualdade é o que faz sentido.
  Normalize aqui é redundante (valores já vêm da lista
  canônica).
- Para `moods`/`contexts` em `queryCandidates`: idem.
- Para `fineGenre` (texto livre): já entra no fluxo de text
  filter (substring), então fica coberto pelo helper geral.

**Rationale**:
- Tags multi-select são valores escolhidos da lista existente do
  user (vocabulário). DJ não digita "dancante" no filtro tag —
  ele clica no chip que diz "dançante". Comparação SQL `value
  IN (?)` continua correta.
- Caso futuro de DJ digitando tag com casing diferente, abre Inc
  separado.
- Para tags textuais livres como `fineGenre`, ele já entra na
  lista de campos pesquisáveis no text filter — fica coberto.

**Alternatives considered**:
- **Normalizar tags no SQL via json_each + LIKE**: rejeitado —
  complica SQL desnecessariamente; não é o ponto de fricção
  reportado.
- **Normalizar moods/contexts especificamente**: rejeitado por
  ora — DJ não digita esses como termo livre.

**Spec FR-006 ajuste**: na prática, normalização aplica apenas
quando o usuário digita texto livre. Filtros multi-select por
chip continuam comparação exata (vocabulário canônico). Esta
decisão pode ser revisitada se DJ pedir.

---

## Decisão 9 — Performance ceiling

**Decision**: aceitamos performance JS-side até ~5k records/user
e ~50k tracks/user. Acima disso, abrimos Inc futuro com schema
delta.

**Rationale**:
- Felipe hoje: ~2500 records / ~10k tracks. Headroom de 2-5x.
- Cap teórico: cada `normalizeText` é ~microssegundos. 50k
  chamadas = ~50ms cumulativo. Aceitável dentro do SC-002 (≤500ms).
- Sinal de migração: SC-002 violado em prod = trigger pra Inc
  novo.

---

## Resumo

9 decisões resolvidas — sem NEEDS CLARIFICATION pendentes. Phase
1 procede com:
- 1 contrato em `contracts/text-helper.md` (especifica
  `normalizeText` + `matchesNormalizedText` + integração nas 3
  queries).
- 1 quickstart com cenários cobrindo bidirecional, mobile,
  multi-user, e escala.
- Sem `data-model.md` (zero schema delta).
