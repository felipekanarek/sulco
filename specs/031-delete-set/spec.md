# Feature Specification: Excluir set

**Feature Branch**: `031-delete-set`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Inc 30 — Excluir set. DJ não consegue excluir um set criado hoje. Operação simplesmente ausente do produto. Cenários comuns: set de teste, set duplicado, set de evento já passado. Decisão pré-acordada: HARD DELETE com window.confirm — set é metadata curatorial criada pelo DJ; quando ele decide apagar, espera apagar de vez. Princípio IV (Preservar) se aplica a records/tracks (curadoria), não a sets (metadata). Cascade FK em set_tracks já existe."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ exclui set de teste/duplicado (Priority: P1)

DJ criou um set durante exploração inicial (ou criou set duplicado por engano) e quer remover da lista `/sets`. Abre o set, clica em "Excluir set", confirma o aviso, e o set é apagado da lista. As faixas e discos do set permanecem intactos na coleção (curadoria preservada).

**Why this priority**: gap funcional simples mas frustrante. Sem essa operação, sets de teste se acumulam permanentemente na lista, poluindo a UX.

**Independent Test**: criar 1 set de teste, abrir em `/sets/[id]`, clicar "Excluir set", confirmar prompt → set sumiu de `/sets`. Tracks/records do set continuam acessíveis em `/`, `/disco/[id]`, e em outros sets que as referenciem.

**Acceptance Scenarios**:

1. **Given** DJ tem 3 sets na lista (incluindo "Set de teste"), **When** ele abre "Set de teste" em `/sets/[id]`, clica "Excluir set" e confirma o prompt, **Then** o set desaparece de `/sets`; tentativa de acessar URL antiga do set retorna 404 ou redirect.
2. **Given** DJ excluiu um set que continha 20 faixas curadas, **When** ele abre `/disco/[id]` de um disco do set excluído, **Then** as faixas e curadoria (selected, BPM, moods, etc.) permanecem intactas.
3. **Given** DJ está numa lista de 5 sets, **When** ele exclui um deles, **Then** restam 4 sets; ordem dos demais preservada.

---

### User Story 2 - DJ desiste da exclusão (Priority: P1)

DJ clicou em "Excluir set" por engano. O sistema pede confirmação. Ele pode cancelar e o set permanece intacto.

**Why this priority**: defesa contra cliques acidentais. Hard delete sem confirmação seria perigoso demais.

**Independent Test**: abrir set, clicar "Excluir set", clicar Cancel no prompt → nada muda; set continua acessível.

**Acceptance Scenarios**:

1. **Given** DJ está em `/sets/[id]`, **When** ele clica "Excluir set" e cancela o prompt de confirmação, **Then** o set permanece intacto; nenhuma escrita no sistema.
2. **Given** DJ clicou "Excluir set" e a operação está em andamento, **When** ele tenta clicar de novo no botão, **Then** o botão está desabilitado durante a execução (sem dupla deleção possível).

---

### User Story 3 - Multi-user isolation (Priority: P2)

DJ A criou um set. DJ B (mesmo banco compartilhado) tenta acessar URL do set de A diretamente. Sistema rejeita. DJ B não consegue excluir set que não é dele.

**Why this priority**: garante isolamento por usuário no banco compartilhado (escala 5-10 amigos). Sem ownership check, vazamento de URL permitiria delete cross-user.

**Independent Test**: simular 2 users no banco; tentar `deleteSet(setIdDeOutroUser)` → falha com erro de ownership.

**Acceptance Scenarios**:

1. **Given** DJ A tem set X, **When** DJ B tenta acessar `/sets/{X}`, **Then** sistema retorna 404 ou redirect (RSC já confirma ownership).
2. **Given** DJ B contornou a UI e disparou Server Action `deleteSet(setIdDoA)`, **When** ação executa, **Then** retorna erro "Set não encontrado" e set de A permanece intacto.

---

### Edge Cases

- **Set vazio (sem set_tracks)**: deleção funciona normalmente — DELETE em sets sem dependentes.
- **Set com 100+ tracks**: cascade FK em `set_tracks` deleta todas as relações automaticamente. Custo: 1 DELETE em sets + cascade. Trivial.
- **Tentativa de deletar set inexistente** (já deletado, race com outro tab): retorna erro silencioso ou mensagem "Set não encontrado". Sem efeito colateral.
- **DJ no `/sets/[id]/montar` quando exclui em outra aba**: ao tentar adicionar/remover faixa, Server Action falha pq set não existe. UX aceitável (rara).
- **Permissões**: apenas o usuário dono pode excluir. Owner roles (admin) NÃO podem excluir sets de outros users (princípio I).
- **Recuperação**: hard delete = sem recuperação via UI. Recuperação só via backup do banco (custo manual do mantenedor — escala atual de Felipe é 1-2 sets de teste).
- **Acesso por URL após delete**: 404 padrão Next.js (caminho `/sets/[id]` não encontra row → RSC pode chamar `notFound()` ou redirect — decisão no plan).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST oferecer ação "Excluir set" visível ao usuário dono do set quando ele está visualizando o set.
- **FR-002**: Ação MUST exigir confirmação explícita antes de executar (prompt nativo do navegador é aceitável e atende Princípio V Mobile-Native).
- **FR-003**: Confirmação MUST informar claramente: (a) o nome do set, (b) que faixas e discos da coleção permanecem intactos, (c) que a operação não pode ser desfeita.
- **FR-004**: Ao confirmar, sistema MUST hard-delete o set (remoção física da tabela), não soft-delete via flag.
- **FR-005**: Hard delete MUST acionar cascade automático nas relações dependentes (set_tracks), removendo apenas a associação set↔track sem afetar as tracks em si.
- **FR-006**: Sistema MUST preservar 100% das faixas (`tracks`) e discos (`records`) que estavam no set — incluindo curadoria autoral (selected, BPM, moods, contexts, comment, etc.).
- **FR-007**: Sistema MUST verificar ownership antes de executar a deleção — apenas o dono do set pode excluí-lo.
- **FR-008**: Tentativa de excluir set que não é do user logado MUST retornar erro sem efeito colateral.
- **FR-009**: Após deleção bem-sucedida, sistema MUST navegar o usuário pra lista `/sets`.
- **FR-010**: Após deleção, lista `/sets` MUST refletir a remoção imediatamente (sem necessidade de refresh manual).
- **FR-011**: Botão de exclusão MUST ficar disabled durante a execução, prevenindo cliques múltiplos.
- **FR-012**: Em caso de erro (banco indisponível, ownership inválido, etc.), sistema MUST mostrar mensagem amigável ao usuário sem quebrar a UI.
- **FR-013**: Ação MUST ser executada em ≤500ms percebidos pelo DJ em condições normais.
- **FR-014**: NÃO há modal custom — usa-se o prompt nativo do navegador (`window.confirm`). Modal custom fica como ideia futura no backlog.

### Key Entities

- **Set** (sets table — existing): metadata curatorial criada pelo DJ. Atributos:
  - **Identidade**: id (PK), userId (FK pra users com ON DELETE CASCADE — preservado).
  - **Conteúdo**: name, eventDate, location, briefing, montarFiltersJson, createdAt, updatedAt.
  - **Visibilidade**: cada set pertence a 1 user; isolamento via FK userId.
  - **Lifecycle**: criado via UI; editado via UI (Inc 16); **deletado via UI (Inc 30 NOVO)**; cascade automático em set_tracks ao deletar.

- **Set-Track relation** (set_tracks table — existing): relação efêmera N:N. Atributos:
  - **Identidade**: composta `(setId, trackId)`.
  - **Cascade**: `setId` tem ON DELETE CASCADE pra `sets.id` (já existe no schema, linha 215).
  - **Significado**: track-X-está-no-set-Y. Se set Y é deletado, relação some — track X continua intacta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos sets de teste/duplicados que o DJ deseja remover podem ser excluídos via UI em ≤30 segundos (3 cliques: abrir set → excluir → confirmar).
- **SC-002**: Após deleção, set não aparece mais em `/sets` em refreshes subsequentes (verificável via comparação visual antes/depois).
- **SC-003**: Faixas e discos que estavam no set permanecem 100% intactos pós-deleção (verificável via consulta a `/` e `/disco/[id]`).
- **SC-004**: Botão de exclusão NÃO fica acessível pra usuários que não são donos do set (verificável via teste com 2 contas — RSC retorna 404).
- **SC-005**: Operação de delete completa em ≤500ms percebidos (verificável via Network tab).
- **SC-006**: Custo em rows lidas pelo banco é ≤10 rows por execução (1 SELECT ownership + 1 DELETE com cascade).
- **SC-007**: Build TypeScript passa zero erros após adição da Server Action + componente.
- **SC-008**: Zero regressão funcional em fluxos existentes (`/sets`, `/sets/[id]`, `/sets/[id]/montar`, edição de set Inc 16).

## Assumptions

- `set_tracks.setId` já tem `ON DELETE CASCADE` no schema (verificado: linha 215 de `src/db/schema.ts`). Sem schema delta necessário.
- Set é metadata pura — DJ aceita hard-delete sem soft-archive. Diferente de records que têm `archived` pra preservar curadoria pós-sync.
- Confirmação via `window.confirm` é UX aceitável — modal custom fica como Inc futuro (backlog "Modal de confirmação custom").
- Botão fica em `/sets/[id]` (visualização do set). Decisão final no plan.
- Recuperação de set deletado por engano não está no escopo — fluxo manual via backup do banco se necessário (escala atual: 1-2 sets de teste por user).
- Ownership check via `requireCurrentUser` + `WHERE sets.userId = user.id`. Admin/owner roles NÃO podem excluir sets de outros users.
- Tentativas de delete de set inexistente (race condition) retornam erro silencioso. Sem retry automático.
- Mobile e desktop usam mesmo fluxo (`window.confirm` é fullscreen nativo em iOS/Android — Princípio V).
