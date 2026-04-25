# Feature Specification: Curadoria aleatória direto pro disco

**Feature Branch**: `006-curadoria-aleatoria`
**Created**: 2026-04-24
**Status**: Draft
**Input**: Botão "Curar disco aleatório" que sorteia 1 record `unrated`
do acervo do user e redireciona direto pra `/disco/[id]`, pulando a
tela intermediária de triagem sequencial `/curadoria`. Quebra o viés
cronológico da triagem ordenada (`importedAt asc`) — DJ tem 2531
discos `unrated` no acervo brasileiro e a abordagem sequencial cansa.

## User Scenarios & Testing

### User Story 1 — Curar 1 disco aleatório por sessão (Priority: P1)

DJ tem 2500+ discos não triados. Em vez de abrir `/curadoria` e seguir
a fila ordenada, ele clica um botão "Curar aleatório" e é levado
direto pra `/disco/[id]` de um disco sorteado entre os `unrated`.
Cada clique é uma sessão curta (5-10 min) num disco diferente. Ao
voltar amanhã, sorteia outro.

**Why this priority**: Destrava o backlog de triagem. Triagem
sequencial pelo `importedAt` causa abandono — DJ sempre vê os mesmos
discos antigos primeiro, enjoa, para. Aleatório força exposição
distribuída ao acervo inteiro.

**Independent Test**: Pode ser validado sozinho clicando o botão
várias vezes seguidas e verificando que: (a) cada clique vai pra um
disco diferente, (b) os discos são todos `unrated`, (c) não cai em
disco arquivado.

**Acceptance Scenarios**:

1. **Given** acervo com 100 discos `unrated`, **When** DJ clica
   "Curar disco aleatório", **Then** é redirecionado pra `/disco/[id]`
   de um dos 100 discos.
2. **Given** acervo com 0 discos `unrated` (tudo já triado),
   **When** DJ clica o botão, **Then** vê mensagem clara "Todos os
   discos já foram triados" e fica na página atual (não redireciona).
3. **Given** acervo com discos `archived=true` e `unrated`,
   **When** DJ clica o botão, **Then** o sorteio nunca cai em
   arquivado.
4. **Given** DJ clica 5 vezes seguidas o botão, **When** observa os
   discos visitados, **Then** a probabilidade de cair no mesmo disco
   2 vezes em 5 cliques é baixa (≤ 5/100 com 100 unrated). Não é
   garantia matemática anti-repetição — é distribuição uniforme.

### Edge Cases

- **0 discos elegíveis**: mensagem clara, sem redirect
- **1 só disco elegível**: sorteia ele sempre
- **Disco arquivado entre sorteio e redirect**: extremamente raro
  (race entre sync Discogs e click). Aceito — DJ vê o disco arquivado
  e pode fechar.
- **Multi-user**: sorteio respeita ownership (records.userId =
  user.id atual)

## Requirements

### Functional Requirements

- **FR-001**: Sistema MUST expor botão visível "Curar disco aleatório"
  no header da home (`/`) e/ou em `/curadoria`. Localização exata:
  decisão de UX, mas DEVE ser acessível em ≤ 1 click depois do login.
- **FR-002**: Click no botão MUST disparar Server Action que sorteia
  1 record com `archived = false` AND `status = 'unrated'` AND
  `userId = currentUser.id`.
- **FR-003**: Server Action MUST redirecionar (`redirect()`) pra
  `/disco/[id]` do record sorteado.
- **FR-004**: Quando 0 records são elegíveis, sistema MUST exibir
  mensagem informativa ("Não há discos pra triar — todos já foram
  avaliados") e NÃO redirecionar.
- **FR-005**: Sorteio MUST respeitar ownership multi-user (FR-017 do
  005) — nunca sortear disco de outro user.
- **FR-006**: Sorteio MUST ser uniforme — cada disco elegível tem a
  mesma probabilidade. Implementação via `ORDER BY RANDOM() LIMIT 1`.

### Key Entities

Nenhum schema novo. Reusa `records.userId`, `records.archived`,
`records.status`.

## Success Criteria

- **SC-001**: DJ consegue abrir um disco aleatório em 1 click + 1
  redirect (≤ 2 segundos total na média).
- **SC-002**: Distribuição é razoavelmente uniforme — clicando 100
  vezes em acervo de 1000 discos, nenhum disco aparece >3 vezes
  (validação manual por amostragem; chi-squared seria overkill).
- **SC-003**: Zero vazamento cross-user — sorteio nunca retorna
  disco de outro DJ (validado por teste de integração).

## Assumptions

- Acervo do DJ tem ao menos alguns discos `unrated` na maior parte
  do tempo (pq DJ está no meio do processo de triagem).
- DJ acessa via desktop (botão pode ficar discreto no mobile no MVP).

## Fora de escopo

- Filtro de aleatório por gênero/estilo (depende do **Bug 9**)
- Histórico de discos sorteados (anti-repetição garantida)
- Modo "fila aleatória" — sorteia 10 e mostra um por vez
- Aleatório também pra `active` ou `discarded` — só `unrated` no MVP
