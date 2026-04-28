# Feature Specification: UI rework das sugestões IA (inline na lista de candidatos)

**Feature Branch**: `015-ai-suggestions-inline`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "Inc 16 — Rework UX do painel de sugestões IA pós-Inc 14: (1) reposicionar bloco abaixo dos filtros, (2) sugestões viram cards inline no topo da listagem de candidatos com moldura/destaque, (3) botão 'Ignorar sugestões' pra reset."

## Clarifications

### Session 2026-04-28

- Q: Quando um trackId aparece nas sugestões IA E também na lista de candidatos comuns, como tratar? → A: Deduplicar — trackIds das sugestões IA são removidos da lista comum. Cada faixa aparece visualmente apenas uma vez: sugestão IA no topo (com moldura) OU candidato comum embaixo (sem moldura), nunca ambos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sugestões aparecem misturadas com candidatos (Priority: P1)

DJ está em `/sets/[id]/montar`, aplica filtros, clica "✨ Sugerir com
IA". As sugestões da IA aparecem **no topo da mesma lista de
candidatos**, com moldura colorida e justificativa em destaque
visual claro. Logo abaixo, na mesma lista, vêm os candidatos comuns
(sem moldura). DJ rola uma lista única do topo (sugeridos) ao fim
(restantes do acervo elegível).

**Why this priority**: É o coração do rework. Sem isso, o problema
reportado (lista duplicada, contexto fragmentado) não é resolvido.

**Independent Test**: clicar "Sugerir com IA" em set válido,
confirmar visualmente que existe **apenas uma lista** de candidatos
abaixo dos filtros, com cards de IA destacados no topo (border
distinta + bg sutil + justificativa em texto destacado) e cards
comuns abaixo sem destaque.

**Acceptance Scenarios**:

1. **Given** DJ tem config IA ativa, set com briefing e filtros
   aplicados, **When** clica "Sugerir com IA", **Then** a listagem
   de candidatos re-renderiza com 5-10 cards de sugestão no topo
   (com moldura accent + bg sutil + justificativa em destaque) e
   restante dos candidatos comuns abaixo, sem barreira visual de
   "duas listas separadas".
2. **Given** sugestões geradas, **When** DJ rola a lista,
   **Then** transição visual entre os últimos cards sugeridos e
   os primeiros candidatos comuns é clara (sem ambiguidade) mas
   não introduz "header" extra de "Outras faixas" (continua sendo
   uma lista única visualmente).
3. **Given** sugestões visíveis, **When** DJ clica "Adicionar ao
   set" em qualquer card (sugerido ou comum), **Then** comportamento
   é idêntico (pattern de adição existente do CandidateRow).

---

### User Story 2 — Reposicionamento abaixo dos filtros (Priority: P1)

DJ entra em `/sets/[id]/montar`. Ordem visual da página é:
**briefing → filtros → painel de sugestões IA → listagem de
candidatos (com sugestões IA no topo)**. Hoje está briefing → painel
sugestões → filtros → listagem.

**Why this priority**: Hierarquia atual confunde — DJ precisa
aplicar/ajustar filtros antes de pedir sugestões pra IA respeitar
o recorte. Painel acima dos filtros é contra-intuitivo. Sem esse
fix, o fluxo permanece truncado.

**Independent Test**: abrir `/sets/[id]/montar`, ver visualmente
ordem briefing → filtros → painel sugestões → listagem.

**Acceptance Scenarios**:

1. **Given** DJ acessa `/sets/[id]/montar`, **When** a página
   renderiza, **Then** ordem vertical é: briefing (se existir) →
   bloco de filtros (form completo desktop, collapsible mobile) →
   painel "Sugestões da IA" (header + botão Sugerir/Ignorar) →
   listagem unificada de candidatos.

---

### User Story 3 — Botão "Ignorar sugestões" reseta lista (Priority: P2)

DJ recebeu sugestões, adicionou alguma, mas quer voltar à lista
"limpa" pra navegar livremente o acervo. Clica "Ignorar sugestões".
A lista volta ao estado pré-IA (todos candidatos sem moldura, sem
justificativa, sem destacados). Botão "Ignorar" some; botão
"Sugerir com IA" volta a estar disponível.

**Why this priority**: Higiene de UX — sem isso, depois de pedir
sugestões DJ fica preso ao destaque até navegar pra outra rota.
Não é P1 porque MVP entrega valor com US1+US2; o reset é polish.

**Independent Test**: gerar sugestões, clicar "Ignorar sugestões",
ver listagem voltar ao estado original (sem moldura, sem
justificativa, ordem por candidato comum). Botão "Ignorar" some.

**Acceptance Scenarios**:

1. **Given** painel está em estado "ready" com ≥1 sugestão visível,
   **When** DJ clica "Ignorar sugestões", **Then** sugestões
   somem do topo da listagem; lista mostra somente candidatos
   comuns na ordem default; botão "Ignorar" some; botão "Sugerir
   com IA" volta a aparecer.
2. **Given** DJ clicou "Ignorar" e voltou ao default, **When**
   clica "Sugerir com IA" novamente, **Then** nova geração
   acontece normalmente (sem confirmação — não há sugestões
   pendentes pra preservar).

---

### Edge Cases

- **Sugestão cujo `trackId` já está em `set_tracks`** (race rara —
  DJ adicionou no card de sugestão e action de sugerir disparou
  antes do refresh): card de sugestão renderiza com flag "✓ no
  set" do `<CandidateRow>` existente. Comportamento idêntico ao
  candidato comum em mesma situação.
- **Lista de candidatos comuns vazia** (filtro super restritivo,
  acervo pequeno) **+ sugestões geradas**: lista mostra só os
  cards de sugestão. Sem cards comuns abaixo. OK.
- **Lista comum vazia E sem sugestões**: estado original do
  `/montar` (mensagem "Nenhum candidato — relaxe filtros").
  Botão "Sugerir com IA" continua disponível.
- **DJ adicionou todas as sugestões ao set**: cards permanecem
  visíveis com flag "✓ no set" (mesmo pattern do CandidateRow).
  Botão "Ignorar" continua disponível.
- **Catálogo elegível com 0 candidatos** (mensagem do Inc 14):
  preservada como já está — botão "Sugerir" exibe erro inline
  sem afetar listagem.
- **Re-clicar "Sugerir com IA" com sugestões visíveis**: pattern
  do Inc 14 preservado (`window.confirm` substitui).
- **Mobile**: cards de sugestão e comuns no mesmo container ainda
  empilhados. Moldura/destaque legível em viewport ≤640px (Inc 009).
- **Cards de sugestão `added=true`**: mesmo pattern do `<CandidateRow>`
  existente — flag visual "no set", card permanece visível.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Painel "Sugestões da IA" (botão + estado) MUST ficar
  posicionado **abaixo** do bloco de filtros e **acima** da
  listagem de candidatos. Ordem da página: briefing → filtros →
  painel sugestões → listagem.
- **FR-002**: Cards de sugestão MUST aparecer no **topo da mesma
  listagem** de candidatos (não em lista separada). Cards de
  sugestão e cards comuns MUST compartilhar o mesmo container
  visual (mesma `<div>` ou estrutura).
- **FR-002a**: TrackIds presentes nas sugestões IA MUST ser
  removidos da lista de candidatos comuns. Cada faixa aparece
  visualmente apenas uma vez: como sugestão IA no topo (com
  moldura) OU como candidato comum (sem moldura), nunca ambos.
  Ordem final: sugestões IA na ordem retornada pela IA, seguidas
  dos candidatos comuns na ordem default (já estabelecida pelo
  `queryCandidates`).
- **FR-003**: Cards de sugestão MUST ter destaque visual distinto:
  border/moldura na cor accent, bg sutil (`paper-raised` ou
  similar), badge "✨ Sugestão IA" mais proeminente que a versão
  Inc 14, e justificativa em texto maior + cor mais escura.
- **FR-004**: Cards comuns (sem sugestão IA) MUST manter aparência
  atual (sem border accent, sem bg destacado, sem badge).
- **FR-005**: Botão "Ignorar sugestões" MUST aparecer **apenas
  quando** há sugestões ativas no estado (>0 sugestões geradas e
  não-zeradas). Em estado idle/generating/error, botão não
  renderiza.
- **FR-006**: Clicar "Ignorar sugestões" MUST resetar o estado das
  sugestões para vazio, fazendo a listagem voltar ao default
  (somente candidatos comuns na ordem original). Sem confirmação
  — ação é reversível (basta clicar "Sugerir" novamente).
- **FR-007**: Após "Ignorar", botão "Sugerir com IA" MUST voltar
  a aparecer e funcionar normalmente.
- **FR-008**: Funcionalidades existentes do Inc 14 MUST ser
  preservadas: confirmação no re-gerar, anti-duplicação,
  multi-user isolation, mensagens de erro contextuais, botão
  desabilitado quando sem config IA.
- **FR-009**: Comportamento de "Adicionar ao set" em cards de
  sugestão MUST ser idêntico ao de cards comuns (mesma Server
  Action `addTrackToSet`, mesma flag visual após adicionar).
- **FR-010**: Mobile (≤640px): cards de sugestão e comuns MUST
  empilhar verticalmente em ordem (sugeridos primeiro), sem
  quebra de layout. Moldura/badge legíveis (Inc 009).

### Key Entities

Sem novas entidades. Reutiliza:
- **Set / SetTrack / Track / Record**: sem mudança.
- **AISuggestionView** (estado client): mesma estrutura do Inc 14
  (`{ trackId, justificativa, added }`). Mantido em estado
  client.

Estado da página: agora a página de `/sets/[id]/montar` tem estado
client de "sugestões ativas" que afeta como a lista de candidatos
é renderizada (sugestão match → card destacado; resto → card comum).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Página renderiza com ordem visual correta (briefing →
  filtros → painel sugestões → listagem) em 100% dos acessos a
  `/sets/[id]/montar`.
- **SC-002**: Após gerar sugestões, lista única (não duas listas
  separadas) é renderizada — verificável via inspeção visual e
  via DOM (apenas um container de cards de candidato).
- **SC-003**: Cards de sugestão são visualmente distintos dos
  cards comuns em ≥3 dimensões: moldura, background, badge
  proeminente, justificativa em destaque (4 dimensões cumpridas
  é desejável).
- **SC-004**: Clicar "Ignorar sugestões" remove TODOS os
  destaques visuais em ≤200ms (sem reload de servidor — reset
  é client-side).
- **SC-005**: Funcionalidades do Inc 14 funcionam idênticas
  (zero regressão): testar adição individual, re-gerar com
  confirmação, mensagens de erro, multi-user.
- **SC-006**: Mobile (375px-640px): layout permanece sem
  scroll horizontal nem quebra de moldura.

## Assumptions

- A listagem manual de candidatos atualmente é renderizada server-
  side pelo RSC `/sets/[id]/montar/page.tsx`. Pode precisar virar
  client (ou wrapper client) pra reagir ao estado de sugestões.
  Decisão de orquestração fica para o plan.
- "Moldura accent" usa o token `--accent` existente no design
  system. Background sutil pode ser `paper-raised` ou `accent/5`
  (10% opacity). Decisão visual fica para o plan/implementação.
- Justificativa "em destaque" significa: tamanho `text-[15px]`
  italic, cor mais escura que `text-ink-soft` (sugestão:
  `text-ink-soft` → `text-ink-soft` com fonte maior, ou
  `text-ink` direto). Decisão visual fica para o plan.
- Sem mudança de Server Action — `suggestSetTracks` e
  `addTrackToSet` permanecem como estão.
- Sem schema delta.
- Botão "Ignorar sugestões" fica próximo ao botão "Sugerir com
  IA" (mesmo header/seção). Posição exata fica para o plan/UI.
- Pré-requisito: Inc 14 (briefing com IA em /sets/montar) já
  entregue em produção.
