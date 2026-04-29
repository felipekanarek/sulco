# Feature Specification: Botão "Reconhecer tudo" no banner de archived

**Feature Branch**: `017-acknowledge-all-archived`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "Inc 11 — Quando há vários discos arquivados pendentes em /status (saíram do Discogs), reconhecer um a um vira fricção. Adicionar botão 'Reconhecer tudo' que marca todos como reconhecidos com confirmação."

## Summary

Hoje em `/status` cada disco arquivado pendente tem botão "Reconhecer"
individual via `<ArchivedRecordRow>`. Quando sync detecta vários
removidos de uma vez (ex: Felipe reportou 9 archived após sync 268
em 2026-04-25), reconhecer um a um vira atrito. Esta feature adiciona
**1 botão "Reconhecer tudo"** no header da seção quando há ≥2
pendentes, com confirmação simples antes de executar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Reconhecer múltiplos archived de uma vez (Priority: P1)

DJ acabou de fazer limpeza grande na coleção do Discogs (vendeu/
removeu 9 discos). No próximo sync, banner global aparece em toda
rota dizendo "9 discos foram removidos da sua coleção…". Clica
"Revisar →" e vai pra `/status`. Vê os 9 cards de archived. Em vez
de clicar 9× "Reconhecer", clica **"Reconhecer tudo"** uma vez.
Confirmação aparece ("Marcar todos os 9 como reconhecidos?").
Confirma. Página atualiza, seção "Discos arquivados" some, banner
global some.

**Why this priority**: É o caso fundador da feature. Sem isso, DJ
com limpezas frequentes em volumes grandes (10+) tem fricção real
e pode adiar reconhecer (deixando banner permanente na rota).

**Independent Test**: a partir de conta com ≥2 records `archived=true`
+ `archivedAcknowledgedAt IS NULL`, abrir `/status`, clicar
"Reconhecer tudo", confirmar. SQL deve confirmar que TODOS aqueles
records ficaram com `archivedAcknowledgedAt = now()`. Banner global
some na home.

**Acceptance Scenarios**:

1. **Given** DJ tem ≥2 records archived pendentes, **When** acessa
   `/status` e clica "Reconhecer tudo", **Then** confirmação
   `window.confirm("Marcar todos os N como reconhecidos?")` aparece.
2. **Given** DJ confirma a ação, **When** o sistema executa,
   **Then** TODOS os records archived pendentes do user atual ficam
   com `archivedAcknowledgedAt = now()`, a seção "Discos arquivados"
   some de `/status` e o banner global some em todas as rotas.
3. **Given** DJ cancela a confirmação, **When** o estado da UI é
   restaurado, **Then** os records permanecem inalterados (sem
   chamada à action) e o botão volta ao estado clicável.

---

### User Story 2 — Botão só aparece quando há mais de 1 pendente (Priority: P2)

DJ tem apenas 1 disco archived pendente. Não faz sentido mostrar
"Reconhecer tudo" — o botão individual já cumpre. Botão "Reconhecer
tudo" deve esconder-se nesse caso pra evitar fricção desnecessária.

**Why this priority**: UX clean. Não é P1 porque ter o botão sempre
visível com 1 pendente seria só redundância visual, não bug
funcional. Mas vale fazer junto.

**Independent Test**: estado com exatamente 1 archived pendente —
botão "Reconhecer tudo" NÃO aparece. Estado com 0 archived
pendentes — seção inteira não renderiza (já era assim).

**Acceptance Scenarios**:

1. **Given** DJ tem exatamente 1 archived pendente, **When** acessa
   `/status`, **Then** seção "Discos arquivados" mostra apenas 1
   card e o header NÃO mostra botão "Reconhecer tudo".
2. **Given** DJ tem ≥2 archived pendentes, **When** acessa `/status`,
   **Then** header mostra botão "Reconhecer tudo" próximo ao
   contador "N pendentes".

---

### Edge Cases

- **Race condition** (sync rodando enquanto DJ clica "Reconhecer
  tudo"): a action faz UPDATE bulk single-statement com `WHERE
  archivedAcknowledgedAt IS NULL`. Se sync arquivar mais discos
  durante a execução, esses NÃO entram no UPDATE corrente — DJ
  vê eles depois (comportamento aceito).
- **Sucesso parcial impossível**: bulk UPDATE é atômico no SQLite/
  Turso. Ou todos atualizam ou nenhum (em caso de erro de DB).
  Mensagem de erro genérica ("Falha ao reconhecer — tente
  novamente.") cobre o caso raro.
- **Multi-user isolation**: action filtra `WHERE userId = user.id`
  no UPDATE. DJ A NÃO consegue reconhecer archived de DJ B mesmo
  com URL forjada.
- **Mobile** (Princípio V): botão precisa ter tap target ≥ 44×44 px.
  `window.confirm` nativo do browser cobre bem em iOS/Android.
- **Acessibilidade**: confirmação `window.confirm` é screen-reader-
  friendly por default.
- **Botão durante execução** (race click): deve ficar `disabled`
  com label "Reconhecendo…" enquanto Server Action está em
  flight, prevenindo double-click.
- **Nenhum archived pendente após sucesso**: seção inteira some;
  banner global some — comportamento já existente preservado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST oferecer botão "Reconhecer tudo" no
  header da seção "Discos arquivados" em `/status`, próximo ao
  contador "N pendentes".
- **FR-002**: Botão MUST aparecer apenas quando há **2 ou mais**
  archived pendentes do user atual. Com 1 pendente, botão NÃO
  renderiza (botão individual basta).
- **FR-003**: Clicar o botão MUST exibir confirmação nativa do
  navegador antes de executar — mensagem inclui o número total
  ("Marcar todos os N como reconhecidos?").
- **FR-004**: Cancelar a confirmação MUST resultar em zero efeito
  (sem chamada server, sem mudança no DB).
- **FR-005**: Confirmar MUST resultar em UPDATE bulk de TODOS os
  records archived pendentes do user atual (`archived=true AND
  archivedAcknowledgedAt IS NULL AND userId = corrente`),
  setando `archivedAcknowledgedAt` para o instante atual.
- **FR-006**: Após sucesso, banner global de archived MUST sumir
  em todas as rotas (revalidação) e seção "Discos arquivados" em
  `/status` MUST sumir.
- **FR-007**: Multi-user isolation MUST ser garantido — bulk
  UPDATE filtra pelo user atual; outros users não são afetados.
- **FR-008**: Falhas (DB error, race) MUST exibir mensagem
  contextual ao DJ ("Falha ao reconhecer — tente novamente.") sem
  alterar parcialmente o estado.
- **FR-009**: Durante execução, botão MUST ficar desabilitado com
  feedback visual ("Reconhecendo…") pra prevenir double-click.
- **FR-010**: Mobile (≤640px, Princípio V): tap target do botão
  MUST ser ≥ 44×44 px. Confirmação usa nativo do browser
  (compatível mobile-first).

### Key Entities

Sem novas entidades. Reutiliza:
- **Record** (`records.archived`, `records.archivedAcknowledgedAt`,
  `records.userId`).
- Action existente individual `acknowledgeArchivedRecord`
  permanece intacta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ com 9 discos pendentes completa o reconhecimento
  em ≤3 segundos: 1 clique no botão + 1 clique de confirmação
  (vs 9+ cliques no fluxo atual).
- **SC-002**: Após confirmar, banner global some em ≤1 segundo
  (revalidação pós-action).
- **SC-003**: Multi-user isolation verificável com 2 contas:
  DJ A reconhece todos os seus → archived de DJ B permanecem
  intactos.
- **SC-004**: Em mobile (375px-640px), botão "Reconhecer tudo" é
  visível e clicável sem scroll horizontal nem layout quebrado.
- **SC-005**: Confirmação é exibida em 100% dos cliques no botão
  (zero atalho que pule a confirmação).

## Assumptions

- Action existente `acknowledgeArchivedRecord` (individual)
  permanece sem mudança. Esta feature adiciona ação bulk paralela.
- `window.confirm` nativo é aceitável como UX de confirmação
  (alinha com pattern usado em outras ações destrutivas/leves do
  projeto: `<DeleteAccountModal>` usa modal próprio porque é
  delete de conta inteira; aqui é só reconhecer, então confirm
  nativo é proporcional).
- Sem schema delta. Coluna `archivedAcknowledgedAt` (já existente)
  é o que muda.
- Bulk UPDATE single-statement (`UPDATE records SET ... WHERE ...`)
  é atomicamente tratado pelo SQLite/Turso, sem necessidade de
  transação explícita.
- `revalidatePath('/status')` + `revalidatePath('/')` cobre o
  banner global e a página `/status` — banner usa RSC sem cache
  externo.
- Princípio V respeitado: mobile testado no quickstart, tap target
  44×44, sem componente exclusive de mobile necessário (botão
  funciona idêntico — apenas largura/posição respondem ao
  layout existente).
