# Feature Specification: Faixas ricas na tela "Montar set"

**Feature Branch**: `003-faixas-ricas-montar`
**Created**: 2026-04-24
**Status**: Draft
**Input**: Enriquecer visualmente os candidatos de faixa na tela
`/sets/[id]/montar` com todos os campos autorais da curadoria
(moods, contexts, fineGenre, comment, references, rating, Bomba,
shelfLocation e notes do disco), preservando escaneabilidade via
toggle compacto/expandido por linha.

## Clarifications

### Session 2026-04-24

- Q: Como exibir moods/contexts quando a lista é longa? → A: Modo
  compacto trunca em **4 chips visíveis** + um chip final `+N mais`
  indicando quantos ficaram de fora. Modo expandido mostra todos os
  chips com wrap livre. Mantém altura previsível do card compacto
  (escaneabilidade) e segue o mesmo padrão já usado em `filter-bar`
  do piloto pra facetas.
- Q: Quando uma faixa é adicionada à bag, o que acontece com o card
  dela? → A: O card permanece na lista de candidatos, agora com
  marca visual clara indicando "já na bag" (ex: borda diferente,
  check verde, estilo reduzido). O estado expandido/compacto é
  preservado. Assim o DJ consegue avaliar outras faixas do mesmo
  disco no contexto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Decidir rapidamente se uma faixa entra no set (Priority: P1)

Montando um set, o DJ percorre a lista de candidatos filtrada. Hoje
ele só vê artista/título/BPM/tom/energia — não lembra do que anotou
sobre a faixa. Quer decidir "entra ou não" em alguns segundos sem
sair da tela.

**Why this priority**: é o caso de uso central da tela. Sem ele a
feature não existe.

**Independent Test**: com ≥20 candidatos filtrados, o DJ consegue
olhar a lista e avaliar 10 faixas em <30 segundos sem clicar pra
abrir o disco. Sucesso quando o DJ diz "sim, eu vejo tudo que eu
anotei direto aqui".

**Acceptance Scenarios**:

1. **Given** a tela `/sets/[id]/montar` com candidatos carregados,
   **When** o DJ olha o modo compacto de um candidato,
   **Then** vê (além do já existente):
   rating (`+`, `++`, `+++` com `+++` em vermelho bold),
   Bomba badge se aplicável, fineGenre em texto pequeno se preenchido,
   comment truncado em itálico, moods e contexts como chips visuais
   distinguíveis entre si.
2. **Given** o DJ quer ver o contexto completo de uma faixa,
   **When** clica no chevron de expandir daquele candidato,
   **Then** o card expande inline mostrando references, shelfLocation
   do disco, notes do disco, e comment completo (sem truncate). Os
   demais candidatos permanecem compactos.
3. **Given** um candidato tem só alguns dos campos preenchidos,
   **When** renderizado em modo compacto,
   **Then** os campos vazios são omitidos (não aparece "—" nem
   espaço em branco reservado).

---

### User Story 2 — Voltar ao estado compacto (Priority: P1)

O DJ expandiu vários cards para ler os detalhes, agora quer voltar
ao escaneável.

**Why this priority**: sem um caminho de volta, a tela vira muralha.

**Independent Test**: DJ clica no chevron de 3 candidatos expandidos
e cada um volta ao estado compacto imediatamente, sem perder posição
de scroll.

**Acceptance Scenarios**:

1. **Given** um candidato no estado expandido,
   **When** o DJ clica no chevron de colapsar,
   **Then** o card volta ao modo compacto sem alterar o scroll da
   página.
2. **Given** vários candidatos em estados distintos (uns expandidos,
   outros não),
   **When** o DJ faz qualquer ação (aplicar filtro, adicionar
   candidato ao set, reordenar bag),
   **Then** os estados de expansão individuais são preservados
   durante a sessão.
3. **Given** o DJ recarregou a página,
   **When** a tela renderiza,
   **Then** todos os cards voltam ao modo compacto (estado não é
   persistido).

---

### User Story 3 — Não perder a curadoria em momentos de distração (Priority: P2)

O DJ montando set percebe que uma faixa tem um `comment` importante
que ele tinha esquecido ("pra fechar pista" / "lembra Floating
Points"). Ele quer que essa informação chame atenção.

**Why this priority**: experiência de "redescobrir" a própria
curadoria é alto valor mas não é bloqueante se US1 estiver OK.

**Independent Test**: com 10 candidatos dos quais 5 têm `comment`,
o DJ consegue escanear a lista e identificar visualmente quais
têm anotações sem precisar expandir nada.

**Acceptance Scenarios**:

1. **Given** um candidato com `comment` preenchido,
   **When** em modo compacto,
   **Then** o comment aparece em itálico de estilo editorial que
   destaca dos outros campos técnicos (label-tech, mono), ajudando
   o olho a notar anotações.
2. **Given** um candidato sem `comment`,
   **When** em modo compacto,
   **Then** nenhum espaço reservado pro comment aparece — a linha
   fica visualmente mais curta.

---

### Edge Cases

- **Faixa já na bag**: o card permanece na lista de candidatos com
  marca visual de "já na bag" (borda diferenciada ou check verde),
  sem remover da lista. Estado expandido/compacto é preservado.
  Permite ao DJ avaliar outras faixas do mesmo disco com contexto.
- **Faixa sem nenhum metadado autoral** (só BPM/tom do Discogs, sem
  moods/contexts/comment): modo compacto mostra só o que existe; o
  card fica mais curto mas não vazio (mantém BPM/tom).
- **Rating `null`** (DJ nunca avaliou com +/++/+++): não renderiza
  o glifo de rating. Nada aparece.
- **Moods/contexts muito longos** (ex: 6+ tags): modo compacto mostra
  até **4 chips** + chip final `+N mais` (ex: `+3 mais`). Modo
  expandido mostra todos com wrap livre. Aplica-se separadamente a
  cada grupo (moods tem sua própria contagem, contexts idem).
- **Comment muito longo** (200+ chars): truncado com ellipsis em
  compact, visível completo em expanded e também em title tooltip pra
  quem hover com mouse.
- **Disco sem shelfLocation**: omite a linha no expandido; sem
  fallback tipo "—".
- **Disco com notes multi-linha**: preserve line breaks no expandido
  (whitespace-pre-line ou equivalente), max-height com scroll se
  extremamente longo (>500 chars, caso raro).
- **Scroll preservado em expand/collapse**: comportamento padrão de
  Next.js/React; mas vale teste manual se lista tiver 200+
  candidatos.

## Requirements *(mandatory)*

### Functional Requirements

**Modo compacto (default):**

- **FR-001**: O card de candidato DEVE exibir, por default, o modo
  compacto ao carregar a tela. Nenhum card inicia expandido.
- **FR-002**: Modo compacto DEVE incluir, além dos campos já
  existentes (artista, título, BPM, tom, energia): `rating` (se
  preenchido), `BombaBadge` (se `isBomb=true`), `fineGenre` (se
  preenchido), `comment` truncado (se preenchido), `moods` como
  chips visuais, `contexts` como chips com estilo distinto de moods.
- **FR-003**: Campos vazios/null DEVEM ser omitidos no render — sem
  placeholders, traços, ou espaços reservados.
- **FR-004**: `rating` DEVE ser renderizado como símbolos literais
  `+`, `++` ou `+++`. O valor `+++` (rating=3) DEVE aparecer em
  destaque vermelho (cor accent do sistema) e com peso bold. Valores
  `+` e `++` aparecem em tons neutros do sistema.
- **FR-005**: `moods` e `contexts` DEVEM ser distinguíveis
  visualmente entre si (ex: cor de borda diferente, fundo diferente,
  ou prefixo). O estilo deve ser consistente com o `chip-picker`
  usado em `/disco/[id]`.
- **FR-005a**: No modo compacto, cada grupo (moods/contexts) DEVE
  exibir no máximo **4 chips**. Se houver mais, o 5º chip deve ser
  substituído por um chip final `+N mais` (N = total restante) como
  indicador. No modo expandido, todos os chips do grupo aparecem com
  wrap livre, sem truncamento.

**Toggle expand/collapse:**

- **FR-006**: Cada candidato DEVE ter um ícone de chevron (`▸` /
  `▾`) como botão de toggle entre modo compacto e expandido.
- **FR-007**: O estado expandido/compacto DEVE ser independente por
  candidato — alternar um não afeta os outros.
- **FR-008**: O estado DEVE persistir apenas durante a sessão (não
  persiste em banco nem em localStorage). Ao recarregar a página,
  todos os cards voltam ao modo compacto.
- **FR-009**: Alternar o estado de expansão DEVE ser instantâneo
  (sem loading state) e NÃO DEVE disparar requisição ao servidor.

**Modo expandido:**

- **FR-010**: Modo expandido DEVE adicionar ao compacto: `references`
  da faixa, `shelfLocation` do disco-pai, `notes` do disco-pai,
  e `comment` completo (sem truncate).
- **FR-011**: `shelfLocation` DEVE incluir um ícone ou marcador
  visual de localização (ex: 📍, @, ou equivalente) pra ser lido
  rapidamente como "onde pegar da estante".
- **FR-012**: `notes` do disco DEVEM preservar quebras de linha
  (multi-linha visível como digitado).

**Dados:**

- **FR-013**: A query que lista candidatos para montagem DEVE
  retornar todos os campos adicionais: `fineGenre`, `references`,
  `comment` da faixa e `shelfLocation`, `notes` do disco-pai,
  sem exigir múltiplas round-trips.
- **FR-014**: Campos autorais DEVEM ser apenas lidos nesta tela.
  Nenhuma edição inline é permitida. A tela mantém o link/botão
  que leva a `/disco/[id]` para edição.

**Interação com a bag:**

- **FR-014a**: Quando uma faixa é adicionada à bag, seu card na
  lista de candidatos DEVE permanecer visível com marca visual
  clara de "já na bag" (ex: borda accent verde, check, ou estilo
  reduzido). NÃO deve ser removido da lista filtrada.
- **FR-014b**: O estado compacto/expandido do card DEVE ser
  preservado quando a faixa é adicionada ou removida da bag.
- **FR-014c**: Cards marcados como "na bag" DEVEM permitir remoção
  da bag diretamente (botão equivalente de "remover" no próprio
  card, ou interação clara).

**Restrições de arquitetura (herdadas da constituição):**

- **FR-015**: O card em modo compacto DEVE ser renderizado
  server-side (Server Component). Apenas o toggle expand/collapse
  pode usar estado cliente (Client Component).
- **FR-016**: Nenhum campo autoral (moods, contexts, fineGenre,
  comment, references, rating, isBomb, shelfLocation, notes) DEVE
  ser sobrescrito ou afetado pela feature — apenas exibido.
  (Princípio I da Constituição.)

### Key Entities

- **Track (existente)**: ganha exposição de todos os campos já
  persistidos — `rating`, `moods`, `contexts`, `fineGenre`,
  `references`, `comment`, `isBomb`. Sem mudança de schema.
- **Record (existente)**: campos `shelfLocation` e `notes` passam
  a ser expostos na tela de montagem. Sem mudança de schema.
- **CandidateCard (conceito novo de UI)**: componente visual por
  candidato com estado local `{ expanded: boolean }` não-persistido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com 20+ candidatos visíveis, o DJ toma decisão ("entra
  ou não no set") sobre 10 faixas em menos de 30 segundos sem abrir
  `/disco/[id]`. Medido em uma sessão de uso real.
- **SC-002**: 100% dos campos autorais preenchidos estão acessíveis
  direto na tela `/sets/[id]/montar`, via modo compacto + expandido.
- **SC-003**: O toggle expand/collapse reflete visualmente em
  ≤100ms do clique (percepção de "instantâneo").
- **SC-004**: Zero mudanças nos campos autorais após navegação pela
  tela de montagem — verificado comparando DB antes/depois de uma
  sessão (regressão do Princípio I).
- **SC-005**: Sem impacto perceptível de performance em coleções de
  até 500 candidatos — tempo de render da tela se mantém
  estatisticamente igual (±10%) ao antes da feature.
- **SC-006**: Sensação qualitativa — DJ relata "vejo tudo que eu
  anotei" após usar a tela por uma sessão completa de montagem de
  set.

## Assumptions

- O cartão de candidato atual (`src/components/candidate-row.tsx`)
  é o ponto de mudança principal; uma refatoração leve é aceitável.
- O `chip-picker` existente no projeto tem tokens visuais
  reutilizáveis para chips de moods e contexts — aproveitamos.
- O estado expandido não precisa persistir entre sessões (trade-off
  explícito pra evitar mais DB/localStorage).
- A query `listMontarCandidates` em `src/lib/queries/montar.ts`
  pode ser expandida sem impacto perceptível — o custo extra é
  ~5-10 colunas adicionais em cada linha, poucos kB totais.
- Padrão visual do piloto: fonte serif editorial para texto livre
  (comment, references, notes), mono para metadados técnicos
  (BPM, tom, rating literal).
- Performance em coleções grandes (>500 candidatos) não é foco
  deste incremento; se virar problema, vira novo spec de
  otimização.

## Dependencies

- Refactor do componente atual `src/components/candidate-row.tsx`
  para suportar os dois modos e o toggle local.
- Extensão da query `listMontarCandidates` (ou equivalente) para
  retornar os campos faltantes.
- Tokens de cor do sistema (`--accent`, `--ink`, `--ink-soft`,
  `--ink-mute`, `--paper-raised`) — já existem; sem depender de
  novos tokens visuais.

## Out of Scope (backlog registrado)

- Edição inline de qualquer campo autoral na tela de montagem
- Filtros adicionais além dos já existentes
- Preview de áudio por candidato (Spotify — próximo incremento)
- Reorganização da bag física (já existe via dnd-kit)
- Sugestão de faixas com IA (Incremento futuro 1 — Briefing com IA)
- Persistir estado de expansão entre sessões (localStorage ou DB)
- Modo "ver todos expandidos" (toggle global) — por design, UX é
  por-faixa

## Notas de implementação (referência para /speckit.plan)

- Componente afetado: `src/components/candidate-row.tsx`
- Query afetada: `src/lib/queries/montar.ts::listMontarCandidates`
- Possível componente novo: `src/components/candidate-card.tsx` se
  a refatoração exigir componente com estado cliente
- Rota impactada: `src/app/sets/[id]/montar/page.tsx` — só receberá
  campos adicionais; sem mudança de lógica
