# Feature Specification: Editar status do disco direto na grid

**Feature Branch**: `019-edit-status-on-grid`
**Created**: 2026-04-29
**Status**: Draft
**Input**: User description: "Inc 19 — adicionar botões inline na grid de discos (`/`) pra alternar `records.status` entre `unrated` / `active` / `discarded` sem precisar abrir `/disco/[id]`. Optimistic UI, sem confirmação."

## Clarifications

### Session 2026-04-29

- Q: Quando DJ está com filtro de status ativo e clica numa ação que tira o disco daquele filtro (ex: filtro `unrated` ativo + clique em `Ativar`), o card some ou permanece? → A: Card some imediatamente após revalidação (~1s pós-clique). Pattern Inbox-zero — próximo unrated da fila já fica visível. Reverter erro é caminho explícito (filtro `active`/`discarded` + botão Reativar/Descartar — US2).
- Q: Como a mensagem de erro inline desaparece após uma falha de update? → A: Auto-dismiss após ~5s. Some também quando DJ clica em outro botão de status (qualquer card). Pattern toast-like, sem botão fechar manual.

## Summary

Hoje o DJ tem 2 caminhos pra mudar o status de um disco entre
`unrated` / `active` / `discarded`:

1. Abrir `/disco/[id]` e usar o seletor lá (1 navegação por disco —
   caro pra triagem em massa).
2. Triagem sequencial em `/curadoria` (eficiente mas linear — não
   permite pular discos olhando contexto visual da grid).

Falta um caminho intermediário: triar **direto na grid** (`/`).
Caso típico: DJ percorre coleção visualmente, vê uma capa que já
lembra "não vou discotecar mais" → quer marcar Descartado sem
sair. Ou vice-versa: vê algo `unrated` óbvio que sabe que entra
(`active`) e quer aprovar imediato.

Esta feature adiciona botões inline em cada item da grid pra
alternar status com 1 clique. Sem confirmação (transição é
reversível — Princípio IV exige confirm só pra delete físico).
UI atualiza otimisticamente — clique imediato; rollback visual em
caso de erro.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Aprovar disco unrated direto da grid (Priority: P1)

DJ está navegando a grid em `/` (com filtro `unrated` ou sem
filtro). Vê um disco que ele já sabe que vai discotecar — capa,
artista e ano deixam óbvio. Clica no botão `Ativar` no item da
grid. Item passa imediatamente a mostrar visualmente "ativo"
(badge muda de cor; botão `Ativar` some). Sem navegar pra
`/disco/[id]`, sem confirm.

**Why this priority**: caso fundador — triagem em massa de
unrated é a fricção principal que motivou a feature. P1 porque
sem isso, DJ continua precisando entrar em cada disco
individualmente.

**Independent Test**: a partir de uma conta com ≥3 discos
`status='unrated'`, abrir `/`, clicar `Ativar` em 1 deles. SQL
deve confirmar `status='active'` para aquele recordId. Badge
visual muda no card sem navegação de página. Os outros 2
permanecem `unrated`.

**Acceptance Scenarios**:

1. **Given** disco com `status='unrated'` visível na grid,
   **When** DJ clica `Ativar`, **Then** o disco fica
   imediatamente com aparência "ativa" (badge atualizado, botões
   reorganizados) e o `status` no DB passa pra `active` em ≤1s.
2. **Given** disco com `status='unrated'`, **When** DJ clica
   `Descartar`, **Then** o disco fica com aparência "descartado"
   imediatamente; `status='discarded'` no DB.
3. **Given** múltiplos discos visíveis na grid, **When** DJ
   clica em ações de status em sequência rápida (3 cliques em
   3 cards diferentes em <2s), **Then** todas as ações são
   aplicadas — nenhuma se perde por race com outra.

---

### User Story 2 — Reverter status de disco descartado (Priority: P2)

DJ ativou ou descartou um disco por engano (ou mudou de ideia).
Filtra a grid por `discarded`, encontra o disco, clica
`Reativar`. Disco volta pra `active`, mantendo toda a curadoria
preservada (faixas selecionadas, BPM, comentários — Princípio
IV). Sem perder nada.

**Why this priority**: undo barato — sem isso, DJ precisa
entrar no `/disco/[id]` pra reverter. P2 porque não é o caso
fundador (descartado de propósito é maioria), mas é gatilho
psicológico importante: sem caminho fácil de reverter, DJ
hesita em descartar rapidamente.

**Independent Test**: a partir de disco com `status='discarded'`,
abrir `/?status=discarded`, clicar `Reativar`. SQL confirma
`status='active'`. Curadoria do disco (faixas selecionadas,
metadados) permanece intacta.

**Acceptance Scenarios**:

1. **Given** disco com `status='discarded'`, **When** DJ clica
   `Reativar`, **Then** `status='active'` e todas as faixas
   curadas + comentários permanecem inalterados.
2. **Given** disco com `status='active'`, **When** DJ clica
   `Descartar`, **Then** disco vai pra `discarded`. Faixas
   curadas continuam preservadas (não são deletadas).

---

### User Story 3 — Falha de servidor com rollback visual (Priority: P3)

DJ clica `Ativar` em um disco. Servidor falha (DB indisponível,
sessão expirada, etc). UI mostrou otimisticamente "ativo" mas o
write não persistiu. Sistema reverte visualmente o disco para
`unrated` e exibe mensagem de erro inline próxima ao disco.

**Why this priority**: edge case raro mas preserva confiança no
sistema. P3 porque erros de DB em ações pequenas são incomuns,
mas sem rollback visual o DJ pode achar que mudou e não mudou.

**Independent Test**: simular falha (parar Turso ou expirar
sessão) durante clique. Card volta visualmente pra estado
anterior; mensagem "Falha ao atualizar — tente novamente"
aparece próxima ao disco; SQL confirma `status` inalterado.

**Acceptance Scenarios**:

1. **Given** server retorna `{ ok: false, error: ... }`,
   **When** DJ clicou em mudança de status, **Then** UI volta
   ao estado anterior (badge volta) e mensagem de erro aparece
   próxima ao card.
2. **Given** mensagem de erro visível, **When** passam ~5s sem
   nova ação OU DJ dispara outra ação de status em qualquer
   card, **Then** a mensagem some automaticamente.
3. **Given** mensagem de erro visível, **When** DJ reclica no
   mesmo botão pra tentar de novo, **Then** nova tentativa
   procede normalmente (mensagem antiga some imediatamente ao
   disparar a nova ação).

---

### Edge Cases

- **Disco com faixas em set "em montagem"**: DJ pode mudar
  status livremente (active → discarded ou vice-versa). Faixas
  já adicionadas em sets permanecem nos sets — Inc 6 futuro
  vai lidar com fluxo de delete manual. Status do disco NÃO
  bloqueia a faixa em set.
- **Race com `/curadoria`**: DJ tem `/curadoria` aberto em
  outra aba e classificou o mesmo disco lá enquanto a grid em
  outra aba também atua. Última escrita ganha (LWW —
  comportamento aceito; ambas rotas escrevem o mesmo campo
  `records.status`).
- **Filtro ativo da grid (Inbox-zero pattern)**: quando o
  filtro corrente exclui o status novo (ex: filtro `unrated`
  ativo + clique em `Ativar` → disco vira `active`), o card
  MUST sair da listagem após revalidação do RSC (~1s pós-
  clique). Permanência transiente entre o clique (otimistic)
  e o re-render é aceita. DJ tem fluxo explícito de reverter
  via mudança de filtro (US2).
- **Mobile (≤640px, Princípio V)**: botões precisam ter tap
  target ≥44×44 px. Layout da grid em mobile (1 coluna) tem
  mais espaço vertical — botões inline ocupando largura total
  do card são aceitos.
- **Discos arquivados** (`records.archived=true`): NÃO
  recebem essa UI — discos archived têm fluxo próprio em
  `/status` (Inc 11/017). Status só é editável pra discos
  ativos na coleção (`archived=false`).
- **Multi-user isolation**: `updateRecordStatus` já filtra por
  `userId`. DJ A não consegue mudar status de discos do DJ B
  mesmo com URL forjada.
- **Acessibilidade**: botões precisam de label clara
  (`aria-label="Ativar disco X"` etc) e ser focáveis por
  teclado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada item da grid em `/` MUST exibir botões de
  ação de status quando o disco está visível (não-arquivado).
- **FR-002**: Botões MUST aparecer condicionalmente conforme o
  status atual:
  - `status='unrated'`: botões `Ativar` e `Descartar` visíveis.
  - `status='active'`: botão `Descartar` visível.
  - `status='discarded'`: botão `Reativar` visível (transiciona
    para `active`).
- **FR-003**: Clicar um botão MUST disparar a transição de
  status correspondente sem exibir confirmação de diálogo.
  Todas as transições são reversíveis e não-destrutivas.
- **FR-004**: A UI MUST atualizar **otimisticamente** —
  imediatamente após o clique (≤100ms), o card mostra o estado
  alvo (badge novo, botões reorganizados), antes do servidor
  confirmar.
- **FR-005**: Se o servidor falhar (`ok: false` ou exceção), a
  UI MUST reverter o card ao estado anterior e exibir mensagem
  de erro inline próxima ao disco. A mensagem MUST desaparecer
  automaticamente após ~5 segundos OU quando o DJ disparar
  outra ação de status em qualquer card (toast-like, sem botão
  fechar manual).
- **FR-006**: Após sucesso, mudanças MUST ser refletidas em
  rotas dependentes (`/`, `/curadoria`, `/disco/[id]`) — disco
  some/aparece conforme filtros, contadores atualizam.
- **FR-007**: Curadoria do disco (faixas selecionadas,
  comentários, BPM, etc.) MUST ser preservada em toda
  transição de status — Princípio IV. Em particular,
  `discarded → active` retorna sem perda.
- **FR-008**: Multi-user isolation MUST ser garantido — botões
  só agem em discos do user atual (já garantido pela Server
  Action existente via `WHERE userId`).
- **FR-009**: Botões MUST ser desabilitados durante a janela
  de execução da ação (entre clique e resposta do server) pra
  prevenir double-click; label visual indica execução
  ("Salvando…" ou similar).
- **FR-010**: Mobile (≤640px, Princípio V): tap target dos
  botões MUST ser ≥44×44 px. Layout do card em mobile MUST
  acomodar os botões sem causar scroll horizontal nem quebra
  visual.
- **FR-011**: Em desktop (≥768px): grid mantém densidade
  comparável ao estado atual (não regredir significativamente
  o número de discos visíveis por linha).
- **FR-012**: Botões MUST ter `aria-label` descritivo (ex:
  "Ativar disco {artista — título}") pra leitores de tela.

### Key Entities

Sem novas entidades. Reutiliza:
- **Record** (`records.status`, `records.userId`,
  `records.archived`).
- Server Action existente `updateRecordStatus(input)` —
  permanece intacta (já valida Zod + ownership + revalidatePath
  nas 3 rotas).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ consegue triar 10 discos `unrated` em ≤30
  segundos sem sair da grid (1 clique por disco; ~3s por
  decisão visual + clique). Hoje, 10 discos via `/disco/[id]`
  individual = 30s só de navegação (~3s por load).
- **SC-002**: Mudança de status fica visível na UI em ≤100ms
  após o clique (otimistic UI).
- **SC-003**: Em mobile (375–640px), botões de status são
  visíveis e clicáveis sem scroll horizontal; tap target
  ≥44×44 px verificável via DevTools.
- **SC-004**: Em desktop (≥1024px), a quantidade de discos
  visíveis por linha permanece dentro de ±20% da contagem
  atual — não há colapso de densidade.
- **SC-005**: Multi-user isolation verificável: DJ A muda
  status de seus discos → discos de DJ B intactos (SQL).
- **SC-006**: Em 100% das transições bem-sucedidas, a
  curadoria do disco (faixas selecionadas, comentários, BPM)
  permanece **byte-idêntica** a antes da transição.
- **SC-007**: Em caso de falha simulada do servidor, UI
  reverte ao estado anterior em ≤500ms e exibe mensagem de
  erro contextual próxima ao card.

## Assumptions

- Server Action `updateRecordStatus` já existe — esta feature
  apenas conecta UI nova a action existente. Sem nova action.
- "Sem confirmação" é decisão UX direta — Princípio IV permite
  (status é reversível, não-destrutivo). Se virar dor (DJ
  reclamar de cliques acidentais), revisitar via Inc futuro
  com toast undo.
- Densidade da grid em desktop pode ser preservada usando
  botões compactos (`min-h-[32px]` desktop) — texto-mono
  pequeno como já é pattern no projeto. Tap target maior
  (`min-h-[44px]`) só em mobile via responsive Tailwind.
- Filtros existentes da home (`unrated`, `active`,
  `discarded`, `archived`) permanecem intactos. Após mudança
  de status, RSC re-renderiza com lista atualizada conforme
  filtro ativo.
- Otimistic UI usa estado local do componente; a revalidação
  do RSC após Server Action sincroniza estado real do server.
- Princípio I respeitado: `status` é AUTHOR. Toda escrita
  parte do clique do DJ; nenhuma fonte externa toca.
- Princípio IV respeitado: nenhum delete, status reversível
  (incluindo `discarded → active`).
- Princípio V respeitado: mobile-first com tap target ≥44×44;
  quickstart MUST validar viewport mobile.
- Discos com `archived=true` NÃO recebem essa UI (fluxo
  separado em `/status`). Botões só aparecem pra discos
  ativos na coleção.
