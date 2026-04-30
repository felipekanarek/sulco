# Feature Specification: Prateleira como select picker (com auto-add)

**Feature Branch**: `020-shelf-picker-autoadd`
**Created**: 2026-04-29
**Status**: Draft
**Input**: User description: "Inc 21 — substituir o input de texto livre de `records.shelfLocation` em `/disco/[id]` por um combobox que sugere prateleiras já usadas pelo DJ + permite criar nova on-the-fly. Reduz inconsistência (E1-P2 vs e1-p2) e acelera digitação repetitiva."

## Summary

Hoje em `/disco/[id]` o campo "Prateleira" é um `<input type="text">`
livre dentro de `<RecordControls>`. DJ digita coisas como `E1-P2`,
`e1-p2`, `E1 P2`, `E1-p2` e cada variação cria uma "prateleira"
distinta no DB — quando ele futuramente buscar por prateleira ou
filtrar a coleção, vai bater fragmentado. Além de inconsistência,
é repetitivo: DJ que tem ~30 prateleiras físicas digita o mesmo
padrão centenas de vezes.

Esta feature substitui o input de texto livre por um **combobox**
(select picker editável) que:

1. Mostra prateleiras existentes do DJ filtradas conforme ele digita.
2. Permite reusar prateleira existente com 1 clique.
3. Permite criar nova prateleira on-the-fly se o termo digitado
   não existe — sem ir pra tela de admin separada.
4. Permite limpar (voltar a sem prateleira) explicitamente.

Sem schema delta. `records.shelfLocation` continua string livre
no DB; apenas a UI vira controlada por um picker.

Pré-requisito UX do **Inc 20** (multi-select bulk edit), onde
mover N discos pra uma prateleira sem o picker seria fricção
multiplicada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Reusar prateleira existente (Priority: P1)

DJ está em `/disco/[id]` editando dados curatoriais. Quer mover
o disco pra prateleira "E1-P2" que já existe (já usada em
outros discos). Clica no campo Prateleira, vê a lista das
suas prateleiras (ordenada alfabeticamente), digita "e1" pra
filtrar, vê "E1-P2", clica. O valor é salvo. Sem digitar o
texto inteiro; sem typo possível.

**Why this priority**: caso fundador. Resolve a fricção de
digitação repetitiva (~95% das vezes que DJ edita prateleira é
pra reusar uma já existente). Sem isso, feature inteira não
entrega valor real.

**Independent Test**: a partir de DB com ≥3 prateleiras
distintas usadas pelo DJ, abrir `/disco/[id]` em um disco sem
prateleira. Clicar no picker, verificar lista de sugestões.
Digitar parte do nome — lista filtra. Clicar uma — campo salva
e RSC re-renderiza com novo valor.

**Acceptance Scenarios**:

1. **Given** DJ tem prateleiras `E1-P2`, `E2-P1`, `Z-Singles`
   já em uso, **When** abre o picker em `/disco/[id]`,
   **Then** vê as 3 prateleiras ordenadas alfabeticamente.
2. **Given** picker aberto com 3 prateleiras visíveis, **When**
   digita "e1", **Then** lista filtra para mostrar apenas
   `E1-P2` (case-insensitive).
3. **Given** lista filtrada com `E1-P2` visível, **When** clica
   em `E1-P2`, **Then** picker fecha, `shelfLocation` do disco
   passa a ser `E1-P2` no DB, e UI mostra o novo valor.

---

### User Story 2 — Criar nova prateleira on-the-fly (Priority: P1)

DJ comprou prateleira nova "E5-P3" e quer começar a alocar
discos lá. Em `/disco/[id]`, abre o picker, digita "E5-P3" — não
existe na lista. No fim da lista aparece opção "+ Adicionar
'E5-P3' como nova prateleira". Clica. Campo salva com novo
valor. Próximo disco que ele editar já vai mostrar "E5-P3" na
lista de sugestões.

**Why this priority**: sem caminho de criação on-the-fly,
feature obriga DJ a sair pra outra tela ou usar input livre —
quebra fluxo. Mesma prioridade P1 que US1.

**Independent Test**: estado com 3 prateleiras existentes
(igual US1). Abrir picker, digitar termo novo (ex: "TESTE-99").
Verificar opção "+ Adicionar 'TESTE-99'" no fim da lista.
Clicar. SQL confirma `shelfLocation = 'TESTE-99'`. Reabrir
picker (mesmo ou outro disco) — `TESTE-99` aparece na lista.

**Acceptance Scenarios**:

1. **Given** picker aberto com lista de prateleiras existentes,
   **When** digita termo que não tem match exato (ex: "X9-Z"),
   **Then** o item "+ Adicionar 'X9-Z' como nova prateleira"
   aparece visivelmente como última opção da lista.
2. **Given** o termo digitado tem match exato com prateleira
   existente, **When** lista mostra a prateleira, **Then** a
   opção "+ Adicionar..." NÃO aparece (sem oferecer duplicação
   exata).
3. **Given** DJ clica em "+ Adicionar 'X9-Z'", **When** o save
   completa, **Then** o disco fica com `shelfLocation = 'X9-Z'`
   (após trim) e a próxima abertura do picker (qualquer disco
   do mesmo DJ) já lista `X9-Z` como sugestão.
4. **Given** termo digitado é só whitespace ou string vazia,
   **When** DJ tenta criar, **Then** o item "+ Adicionar" NÃO
   aparece (não cria prateleira vazia).

---

### User Story 3 — Limpar prateleira (Priority: P2)

DJ quer remover atribuição de prateleira de um disco
(ex: vendeu, virou estoque, ou erro de cadastro). Abre o picker
e clica em "— Sem prateleira —" no topo da lista. Disco fica
sem prateleira no DB.

**Why this priority**: caminho explícito é importante mas
secundário. P2 porque o caso comum é mover, não desmover.

**Independent Test**: disco com `shelfLocation = 'E1-P2'`.
Abrir picker, clicar "— Sem prateleira —". SQL confirma
`shelfLocation = NULL`. UI mostra placeholder.

**Acceptance Scenarios**:

1. **Given** disco com `shelfLocation` preenchida, **When** DJ
   abre o picker, **Then** opção "— Sem prateleira —" aparece
   visivelmente como **primeiro** item da lista (acima das
   prateleiras existentes).
2. **Given** picker aberto, **When** DJ clica "— Sem prateleira —",
   **Then** `shelfLocation = NULL` no DB e UI mostra
   placeholder ("ex: E3-P2" ou texto vazio).
3. **Given** disco já está sem prateleira, **When** DJ abre o
   picker, **Then** "— Sem prateleira —" aparece igualmente,
   mas estado "vazio" não dá problema (não tenta NULLificar
   algo que já é NULL — no-op aceito).

---

### Edge Cases

- **Match case-insensitive na busca**: digitar "e1" deve filtrar
  "E1-P2" e "e1-p2" se ambos existirem (filtragem case-insensitive),
  mas a opção "+ Adicionar 'e1'" só aparece se o termo digitado
  não bater **exatamente** com nada (case-sensitive). Decisão de
  design: preserva o casing como o DJ digitar; **não normaliza
  pra UPPERCASE automaticamente**. Se DJ tem "E1-P2" e digita
  "e1-p2" e clica Adicionar, cria nova entrada "e1-p2" lado-a-lado.
  Esta é uma limitação aceita (trade-off pra não impor norma) que
  vai ser mitigada com SC-005 (lista visualmente já mostra ao DJ
  que existem variações similares).
- **Termo digitado idêntico (case-sensitive)** a prateleira
  existente: mostra a prateleira na lista filtrada, NÃO mostra
  "+ Adicionar" (evita duplicação trivial — Acceptance Scenario
  US2/2).
- **Trim do termo**: espaços no início/fim são removidos no
  submit. Termo só com whitespace = não cria (US2 acceptance #4).
- **Mobile (≤640px, Princípio V)**: picker abre como bottom sheet
  fullscreen-friendly (mesmo pattern de `<FilterBottomSheet>`
  Inc 009), com input de busca + lista rolável. Tap target dos
  itens ≥44×44 px.
- **Lista vazia** (DJ ainda não tem nenhuma prateleira): picker
  abre apenas com "— Sem prateleira —" + opção de criar
  (quando DJ digita algo). Empty state acolhedor: "Você ainda
  não tem prateleiras. Digite o nome da primeira."
- **Lista grande** (50+ prateleiras): picker rola
  verticalmente. Filtragem por busca incremental cobre o
  caso (DJ digita 2-3 chars e a lista cabe na viewport).
- **Limite de comprimento**: `shelfLocation` aceita até 50
  caracteres (limite atual do schema). Picker MUST recusar
  termos > 50 chars (UI feedback).
- **Persistência de novas prateleiras**: criar nova prateleira
  no picker do disco A faz com que ela apareça automaticamente
  na lista do disco B na próxima abertura (RSC re-fetch).
- **Multi-user isolation**: lista mostra apenas prateleiras do
  user atual. DJ A nunca vê prateleiras de DJ B.
- **Acessibilidade**: picker MUST ser navegável por teclado
  (setas, Enter, Escape) e screen-reader-friendly. Padrão
  ARIA combobox (`role="combobox"`, `aria-expanded`,
  `aria-controls`, `aria-activedescendant`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST exibir o campo "Prateleira" em
  `/disco/[id]` como um picker (combobox) — substituindo o
  `<input type="text">` atual.
- **FR-002**: Ao abrir o picker, o sistema MUST listar todas as
  prateleiras distintas em uso pelo user atual, ordenadas
  alfabeticamente (case-insensitive sort).
- **FR-003**: A lista MUST sempre incluir como **primeiro** item
  uma opção "— Sem prateleira —" para limpar atribuição
  (NULL).
- **FR-004**: O picker MUST ter input de busca que filtra a
  lista em tempo real conforme DJ digita (filtragem
  case-insensitive por substring).
- **FR-005**: Quando o termo digitado não bate exatamente
  (case-sensitive) com nenhuma prateleira existente E não está
  vazio (após trim), a lista MUST exibir como último item uma
  opção "+ Adicionar '\<termo\>' como nova prateleira".
- **FR-006**: Clicar em uma prateleira existente MUST persistir
  o valor no DB e fechar o picker.
- **FR-007**: Clicar em "+ Adicionar '\<termo\>'" MUST persistir
  o valor (após `trim()`) no DB. O termo passa a aparecer na
  lista de sugestões na próxima abertura (qualquer disco do mesmo
  DJ).
- **FR-008**: Clicar em "— Sem prateleira —" MUST persistir
  `NULL` no DB e fechar o picker.
- **FR-009**: O termo digitado MUST ter limite de 50 caracteres
  (limite do schema); picker indica visualmente quando o limite
  é atingido e bloqueia digitação adicional.
- **FR-010**: O picker MUST ser fechável sem ação (clique fora,
  ESC) — neste caso, o `shelfLocation` permanece inalterado.
- **FR-011**: Multi-user isolation MUST ser garantido —
  prateleiras listadas são apenas do user atual.
- **FR-012**: Mobile (≤640px, Princípio V): picker MUST se
  comportar como bottom sheet fullscreen-friendly. Tap targets
  dos itens da lista MUST ser ≥44×44 px.
- **FR-013**: Acessibilidade — picker MUST ser navegável por
  teclado (setas para navegar, Enter para selecionar, Escape
  para fechar) e MUST expor atributos ARIA apropriados (`role
  combobox`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`).

### Key Entities

Sem novas entidades. Reutiliza:
- **Record** (`records.shelfLocation: string | null`).
- Server Action existente `updateRecordAuthorFields(input)` —
  permanece intacta (já valida Zod com `max(50).nullable()`,
  ownership e revalidatePath).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma sessão real de DJ alocando 10 discos pra
  prateleiras existentes, o tempo total fica em ≤2 minutos
  (~12s por disco — abrir picker, filtrar 1-2 chars, clicar).
  Hoje, com input livre, ~6s por disco mas com 100% de risco
  de typo cumulativo.
- **SC-002**: Após esta feature, **0%** das novas atribuições
  de prateleira contém typo não-intencional do tipo "E1-P2"
  vs "e1-p2" (DJ pode escolher visualmente). Variações vão
  existir só por escolha consciente.
- **SC-003**: Em mobile (375–640px), picker é totalmente
  utilizável sem scroll horizontal e tap targets dos itens
  são ≥44×44 px.
- **SC-004**: A lista de prateleiras sugeridas reflete em ≤1s
  qualquer adição feita em outro disco (após `revalidatePath`).
- **SC-005**: DJ que abre picker com 30+ prateleiras
  cadastradas consegue selecionar uma específica em ≤5s
  (usando filtragem por digitação).
- **SC-006**: Multi-user isolation verificável: DJ A com 5
  prateleiras e DJ B com 3 prateleiras → A vê 5, B vê 3, sem
  vazamento.

## Assumptions

- Server Action `updateRecordAuthorFields` (existente em
  `src/lib/actions.ts:737`) continua sendo o único caminho de
  escrita. Esta feature entrega apenas UI + helper server-side
  para listar prateleiras (`listUserShelves(userId)` novo).
- **Sem normalização automática de capitalização** — o picker
  preserva o casing exato que o DJ digitar ao criar nova
  prateleira (apenas `trim()` é aplicado). Decisão consciente
  pra não impor regra que pode atrapalhar quem usa convenção
  diferente. Se variantes case duplicadas virarem dor real,
  retomar via Inc futuro com migração one-shot opcional. Hoje,
  filtragem case-insensitive na busca mitiga (DJ vê todas as
  variações próximas e escolhe).
- Ordenação **alfabética case-insensitive** é mais previsível
  que LRU (uso recente). LRU pode ser revisitado se DJ pedir.
- `<input type="search">` semântico no picker; sem
  `inputMode` específico — mantém comportamento padrão
  do browser.
- Bottom sheet em mobile reusa pattern visual e estrutural do
  `<FilterBottomSheet>` (Inc 009) — NÃO reusa o componente
  diretamente porque a interação é diferente (single-select
  com auto-add vs filter multi-select).
- Implementação manual do combobox (constituição proíbe
  shadcn/ui). Pattern Linear/Notion/GitHub.
- Princípio I respeitado: `shelfLocation` continua AUTHOR; a
  feature toca apenas a UI de escrita, nunca a leitura por
  outros sistemas.
- Princípio V respeitado: mobile bottom sheet fullscreen +
  tap targets adequados; quickstart MUST ter cenário mobile.
- Sem schema delta; sem novas Server Actions de escrita; 1 nova
  query helper (`listUserShelves`) que é leitura.
