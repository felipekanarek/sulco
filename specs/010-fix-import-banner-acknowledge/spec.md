# Feature Specification: Fix Bug 13 — Banner de import com acknowledge

**Feature Branch**: `010-fix-import-banner-acknowledge`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Bug 13 — Banner de import permanente na home. O `<ImportProgressCard>` aparece na home mesmo quando não há import em andamento nem recém-concluído. Esperado: em andamento → sempre visível e não-fechável; recém-concluído → visível com botão × fechar; idle/antigo → não renderiza."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Banner some quando o import já foi reconhecido (Priority: P1)

DJ chega na home (`/`) e vê o banner de progresso de import permanecendo
visível mesmo dias depois do import inicial ter terminado. Esse banner
ocupa espaço no topo da coleção sem trazer informação nova. O
comportamento esperado é: depois que o DJ reconhece o resultado do
import (clique explícito em "× fechar"), o banner some e só reaparece
se uma nova execução de import começar.

**Why this priority**: É o core do bug — o banner permanente é o que
o DJ está vivendo hoje. Sem essa parte, nenhuma correção entrega valor.

**Independent Test**: Em uma conta com `syncRuns kind='initial_import'`
de outcome `'ok'` finalizado há mais de uma sessão, o banner aparece
com botão "× fechar"; clicar fecha o banner; recarregar a página
mantém ele fechado.

**Acceptance Scenarios**:

1. **Given** import inicial já terminou (`outcome='ok'`) e o DJ ainda
   não reconheceu, **When** o DJ acessa `/`, **Then** o banner é
   exibido com o resumo de discos importados e um botão "× fechar"
   visível.
2. **Given** import inicial terminou e o DJ clicou em "× fechar",
   **When** o DJ recarrega `/` ou navega de volta para a home,
   **Then** o banner não aparece mais.
3. **Given** o DJ já reconheceu o último import e uma nova execução
   de import começa (ex: `daily_auto` ou um novo `initial_import` em
   conta multi-user), **When** o DJ acessa `/`, **Then** o banner
   reaparece refletindo o estado dessa nova execução.

---

### User Story 2 — Banner sempre visível durante import em andamento (Priority: P1)

Quando há um import rodando, o DJ precisa enxergar progresso em tempo
real (X de Y discos). Esse banner não pode ser fechável: o DJ poderia
fechar por engano e perder a visibilidade do que está acontecendo.

**Why this priority**: Mantém a função original do componente
intacta. Bug 13 só corrige o caso terminal — o caso "em andamento"
já funciona e deve continuar funcionando.

**Independent Test**: Em uma conta com `syncRuns` `outcome='running'`,
abrir `/` mostra o banner sem botão de fechar; o polling continua
atualizando X/Y a cada 3s; nada na UI permite ocultar o banner antes
do término.

**Acceptance Scenarios**:

1. **Given** existe um `syncRun` com `outcome='running'` (ou estado
   transiente que se traduz em "running" via lógica de retomada),
   **When** o DJ acessa `/`, **Then** o banner aparece com eyebrow
   "Importando do Discogs", barra de progresso e SEM botão "× fechar".
2. **Given** o banner está visível em estado running, **When** o
   import termina (`outcome` muda para `'ok'`), **Then** o banner
   passa a exibir o estado terminal com botão "× fechar" disponível.

---

### User Story 3 — Banner de import com erro também é fechável (Priority: P2)

Quando o import termina com erro (`outcome='erro'`) ou de forma
parcial (`outcome='parcial'`/`'rate_limited'` sem retomada
automática iminente), o DJ precisa de uma forma de reconhecer que
viu a mensagem e tirar o banner do caminho. Sem isso, qualquer estado
não-`ok` viraria permanente até a próxima execução.

**Why this priority**: Importante para coerência (o banner não deveria
"prender" o DJ em nenhum estado terminal), mas menos crítico que P1
porque casos `erro`/`parcial` são raros no uso real (o sistema retoma
automaticamente em parcial/rate_limited).

**Independent Test**: Em uma conta com `syncRuns` em outcome
terminal não-`'ok'` e sem retomada pendente, banner aparece com
botão "× fechar"; clicar fecha permanentemente até nova execução.

**Acceptance Scenarios**:

1. **Given** o último `syncRun` está em `outcome='erro'` definitivo
   (sem trigger de retomada), **When** o DJ acessa `/`, **Then** o
   banner aparece com eyebrow "Import interrompido" e botão "× fechar".
2. **Given** o DJ fechou o banner de erro, **When** o DJ acessa `/`,
   **Then** o banner não reaparece até que uma nova execução de
   import comece.

---

### Edge Cases

- **DJ sem import jamais executado** (conta nova vazia): nenhum
  `syncRun` existe — banner não renderiza (mantém comportamento
  atual via `outcome='idle' && x===0`).
- **Múltiplas execuções**: se houver várias linhas de
  `syncRuns kind='initial_import'`, o "último" é o mais recente por
  `startedAt`. O acknowledge é referente a esse último run; uma nova
  execução com `startedAt` posterior reseta o estado de "visto".
- **Acknowledge em estado running**: a action de acknowledge não
  pode ser disparada acidentalmente quando o banner está em
  `running` — o botão simplesmente não existe nesse estado.
- **Import retoma logo depois do acknowledge**: se o DJ fechou um
  banner de `parcial`/`rate_limited` e o sistema dispara uma retomada
  imediatamente, o estado volta para "running" (novo `syncRun` com
  `startedAt` mais recente que o acknowledge) → banner reaparece.
  Esse é o comportamento desejado.
- **Conta multi-user**: o acknowledge é por usuário (`users.id`).
  Não vaza entre contas.
- **Conta com apenas `daily_auto` rodando**: spec foca em
  `kind='initial_import'` (mesmo escopo do componente atual). Sync
  diário não dispara este banner — fora de escopo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O banner de import na home MUST renderizar quando o
  último `syncRun` `kind='initial_import'` do usuário está em estado
  "running" (incluindo retomadas automáticas que produzem
  `outcome='running'` derivado).
- **FR-002**: Em estado "running", o banner MUST NÃO oferecer ação
  de fechar/ocultar.
- **FR-003**: O banner MUST renderizar quando o último
  `syncRun kind='initial_import'` está em estado terminal
  (`'ok'`, `'erro'`, `'parcial'`, `'rate_limited'` sem retomada) E o
  usuário ainda não reconheceu esse run específico.
- **FR-004**: Em estado terminal, o banner MUST exibir um botão
  visível e clicável de fechar (rótulo "× fechar" ou equivalente
  acessível com `aria-label`).
- **FR-005**: Ao clicar em fechar, o sistema MUST persistir um
  marcador de "reconhecido em" associado ao usuário corrente, com
  timestamp do momento do clique.
- **FR-006**: O banner MUST não renderizar quando o último
  `syncRun kind='initial_import'` está em estado terminal E o
  timestamp de reconhecimento do usuário é igual ou posterior ao
  `startedAt` desse último run.
- **FR-007**: Quando uma nova execução de import começa (novo
  `syncRun kind='initial_import'` com `startedAt` posterior ao
  reconhecimento), o banner MUST voltar a renderizar para essa nova
  execução, mesmo que o usuário tenha reconhecido a execução
  anterior.
- **FR-008**: O acknowledge MUST ser por usuário; reconhecimento
  feito por uma conta NÃO afeta visibilidade do banner em outras
  contas.
- **FR-009**: A persistência do reconhecimento MUST sobreviver a
  reload de página, navegação e re-login (não pode depender só de
  estado client-side).
- **FR-010**: Após o clique em fechar, a home MUST refletir
  imediatamente o estado "banner oculto" — sem exigir reload manual.
- **FR-011**: O caso atual de "conta zerada sem syncRun nenhum"
  MUST continuar não exibindo banner (preserva comportamento `idle`
  + `x===0`).

### Key Entities

- **User**: ganha um atributo "última vez que reconheceu o resultado
  de import" (timestamp nullable). Default null = nunca reconheceu.
- **Import progress** (derivado): além dos campos atuais (`running`,
  `x`, `y`, `outcome`, `errorMessage`), passa a expor o `startedAt`
  do último run e o timestamp de reconhecimento do usuário, para
  que o componente decida se renderiza ou não.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em conta com import concluído e reconhecido, o banner
  ocupa 0 pixels de altura na home (não renderiza nenhum elemento
  visual).
- **SC-002**: Em conta com import em andamento, o banner permanece
  visível 100% do tempo até que o `outcome` mude para terminal —
  zero modos de o usuário fechar o banner enquanto running.
- **SC-003**: O ciclo "ver banner terminal → fechar → recarregar"
  resulta em zero exibições subsequentes do banner para aquela
  execução específica (1 reconhecimento basta).
- **SC-004**: Uma nova execução de import faz o banner reaparecer
  em ≤ próxima carga de `/` (sem polling extra dedicado a isso —
  basta o `getImportProgress` já chamado).
- **SC-005**: Zero regressão visual no banner em estado running:
  layout, eyebrow, barra de progresso e hint permanecem idênticos
  ao comportamento atual.

## Assumptions

- O acknowledge é binário e único por usuário ("já vi o último
  resultado"). Não há histórico de acknowledges por run individual
  — basta o timestamp mais recente, comparado contra o `startedAt`
  do run corrente.
- O componente continua sendo client-side com polling de 3s durante
  running (comportamento existente); a única mudança de runtime é
  exibir o botão de fechar e o handler que chama a action.
- Sync diário (`kind='daily_auto'`) não dispara este banner — fora
  de escopo. O escopo permanece restrito a `kind='initial_import'`.
- O DJ aceita que o banner reapareça após nova execução, mesmo se
  ele tiver reconhecido a anterior. Isso é desejado, não bug.
- Schema delta é aditivo (nova coluna nullable em `users`); não
  exige migração de dados existentes.
- Fuso horário do timestamp de reconhecimento segue o padrão do
  projeto (UTC at-rest).
