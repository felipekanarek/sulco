# Feature Specification: Curadoria aleatória respeita filtros aplicados

**Feature Branch**: `011-random-respects-filters`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Inc 10 — Botão 🎲 (Curar disco aleatório) hoje sorteia entre TODOS os discos `unrated` não-arquivados. Quando o DJ tem filtro de gênero/estilo/texto/bomba ativo na coleção (`/?style=MPB`), o aleatório deve respeitar esses filtros — sortear MPB unrated em vez de qualquer disco. Refatorar `pickRandomUnratedRecord` para aceitar os mesmos filtros que `queryCollection`. Sem schema delta. Esforço ~30min."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sortear dentro de um filtro de estilo (Priority: P1)

DJ está triando o acervo de samba. Aplica `?style=Samba` em `/`,
visualiza ~80 discos `unrated` desse estilo, e quer sortear um
aleatoriamente entre eles para cair direto na curadoria. Hoje o
botão 🎲 ignora o filtro e sorteia entre TODOS os ~600 unrated do
acervo — pode cair num MPB, num Jazz, qualquer coisa. O DJ acaba
desistindo do aleatório quando quer triagem temática.

**Why this priority**: É o caso de uso mais comum pós-batch 005
(audio features enriquecidas). DJ filtra por estilo, sorteia,
chega num disco já com BPM/tom preenchidos, foca a curadoria.

**Independent Test**: aplicar `?style=Samba` em `/`, clicar 🎲 10
vezes, e confirmar que TODOS os 10 destinos têm o style "Samba"
listado em `records.styles`. Sem filtro, deve continuar sorteando
qualquer estilo.

**Acceptance Scenarios**:

1. **Given** DJ tem ≥1 disco `unrated` com style "Samba" no acervo,
   **When** acessa `/?style=Samba` e clica em 🎲,
   **Then** é redirecionado para `/disco/[id]` onde `records.styles`
   contém "Samba" e `records.status='unrated'`.
2. **Given** DJ não aplicou nenhum filtro,
   **When** clica em 🎲,
   **Then** é redirecionado para qualquer disco `unrated` não-arquivado
   (comportamento atual preservado).

---

### User Story 2 — Sortear com múltiplos filtros combinados (Priority: P1)

DJ combina filtros para foco máximo: `?style=MPB&style=Bossa+Nova&q=caetano`.
O sorteio deve respeitar **todos os filtros simultaneamente** (mesma
semântica AND que `queryCollection` aplica na listagem).

**Why this priority**: filtros já são compostos no `<FilterBar>`. Se
o sorteio respeita só um campo, a feature fica meia-bomba e o DJ
volta a desconfiar.

**Independent Test**: aplicar `?style=MPB&q=caetano` em `/`, clicar
🎲, e confirmar que o destino: (a) tem MPB em `records.styles`, (b)
tem "caetano" no artista/título/label.

**Acceptance Scenarios**:

1. **Given** DJ aplicou `?style=MPB&q=caetano` e existem ≥1 unrated
   matching, **When** clica em 🎲, **Then** o destino satisfaz os
   dois filtros.
2. **Given** mesmo cenário mas com filtro `?bomba=only`, **When**
   clica em 🎲, **Then** o destino tem ≥1 track `is_bomb=true` (mesma
   semântica do filtro de coleção).

---

### User Story 3 — Empty state contextual quando filtro zera elegíveis (Priority: P2)

DJ aplica filtro estreito (`?style=Free+Jazz` num acervo onde só
existem 2 Free Jazz, ambos já avaliados). Clica 🎲 sem perceber.
Hoje o empty state diz "Não há discos pra triar — todos já foram
avaliados", o que é misleading porque sugere o acervo inteiro.
Esperado: mensagem contextual indicando que a ausência é dos filtros.

**Why this priority**: clareza de feedback. Não é bloqueante
(fluxo principal já funciona), mas evita confusão pra DJ que
"jura" que tem disco daquele estilo pra triar.

**Independent Test**: aplicar filtro que comprovadamente retorna 0
unrated (ex: combinação restritiva), clicar 🎲, ver mensagem que
menciona os filtros.

**Acceptance Scenarios**:

1. **Given** filtros aplicados resultam em 0 elegíveis (`unrated`
   matching), **When** DJ clica em 🎲, **Then** vê mensagem do tipo
   "Nenhum disco unrated com esses filtros" (e NÃO a mensagem de
   acervo vazio).
2. **Given** nenhum filtro aplicado e 0 unrated no acervo todo,
   **When** DJ clica em 🎲, **Then** vê a mensagem original "Não há
   discos pra triar — todos já foram avaliados" (preservado).

---

### Edge Cases

- **Filtro inválido na URL** (style inexistente, q malformado): o
  sorteio simplesmente retorna 0 elegíveis e cai em US3. Não
  precisa validação extra.
- **DJ está em rota não-`/`** (ex: `/sets/[id]/montar`) onde o
  botão 🎲 não está renderizado: fora de escopo. Botão só vive
  na home; sorteio só lê filtros da home.
- **Filtros com muitos termos**: AND entre termos é mantido
  (semântica de `queryCollection`). Sem limite arbitrário.
- **Status filter `all`/`active`/`discarded`**: o sorteio continua
  forçando `status='unrated'` independente do filtro de status —
  o objetivo do botão é triar não-avaliados. Filtro `?status=active`
  na URL é ignorado pela ação aleatória (apenas style/genre/q/bomba
  são respeitados).
- **Filtro inclui `archived`** (não exposto na FilterBar atualmente):
  arquivados são sempre excluídos do sorteio (Princípio IV — não
  triar discos que saíram da coleção do Discogs).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sorteio aleatório MUST aplicar os filtros ativos da
  URL da home (`/`): texto livre `q`, estilos `style[]`, gêneros
  `genre[]`, e tri-estado `bomba`.
- **FR-002**: O sorteio MUST sempre forçar `status='unrated'`,
  ignorando qualquer `?status=` da URL (escopo do botão é triagem
  de não-avaliados).
- **FR-003**: O sorteio MUST sempre excluir discos arquivados
  (`archived=true`).
- **FR-004**: A semântica de combinação dos filtros (AND entre
  termos, fuzzy match em `q`, etc.) MUST ser idêntica à da listagem
  na home (mesma função/regra que decide a listagem).
- **FR-005**: Quando o filtro aplicado retorna 0 elegíveis E há
  filtros ativos, a UI MUST mostrar mensagem que indica explicitamente
  que a ausência é dos filtros (não do acervo todo).
- **FR-006**: Quando o filtro aplicado retorna 0 elegíveis E NÃO há
  filtros ativos, a UI MUST mostrar a mensagem original ("Não há
  discos pra triar — todos já foram avaliados").
- **FR-007**: Sem filtros aplicados, o comportamento atual MUST ser
  preservado (sorteio entre todos os unrated não-arquivados).
- **FR-008**: O fluxo após sorteio bem-sucedido MUST ser idêntico ao
  atual: redirect para `/disco/[id]` do disco sorteado.
- **FR-009**: Multi-user isolation MUST ser preservado (sorteio só
  considera discos do user corrente).

### Key Entities

Sem novas entidades. Reutiliza:
- **Record**: filtros aplicados sobre `userId`, `archived`, `status`,
  `genres`, `styles`, `artist`/`title`/`label` (texto livre).
- **Track**: relação `tracks.is_bomb` é consultada pelo filtro `bomba`.
- **Filtros da URL**: mesmos searchParams já consumidos pela
  listagem da home.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 10 sorteios consecutivos com filtro `?style=Samba`,
  100% dos destinos têm "Samba" em `records.styles` (zero falso-positivo).
- **SC-002**: Sem filtros aplicados, 10 sorteios consecutivos retornam
  estilos diversos (sorteio efetivamente aleatório, comportamento
  preservado).
- **SC-003**: Filtro que comprovadamente zera elegíveis exibe a
  mensagem contextual em ≤1 segundo após o clique.
- **SC-004**: Tempo de resposta do sorteio com filtros ativos ≤500ms
  em acervo de 2500+ discos (consulta indexada por `userId`/`status`/
  `archived` já existe).
- **SC-005**: Zero regressão no comportamento sem filtros — listagem
  da home continua idêntica, botão 🎲 sem filtros mantém UX original.

## Assumptions

- O botão 🎲 vive em `/` (home) e tem acesso aos searchParams da
  rota — passar pra Server Action é trivial.
- Filtros são lidos do client (componente do botão) e enviados
  como argumento para a Server Action. Não há descoberta server-side
  dos filtros (cada Server Action é stateless, recebe input
  explícito).
- A Server Action existente `pickRandomUnratedRecord` recebe um
  objeto opcional de filtros; chamada sem argumento mantém
  comportamento atual (zero filtros).
- Filtros de status (`?status=`) na URL são intencionalmente
  ignorados pelo sorteio — o botão é "Curar disco aleatório", o
  que implica `unrated` por definição.
- Validação dos filtros no Server Action segue o padrão existente
  (Zod com defaults). Filtros inválidos são tratados como ausentes,
  não como erro.
- A mensagem contextual de empty state pode ser fixa ("Nenhum disco
  unrated com esses filtros") — não precisa enumerar quais filtros
  estão ativos, embora isso seja um nice-to-have.
- Sem mudança de schema nem novos índices. O índice composto
  `records_user_status_idx` já cobre o WHERE base.
