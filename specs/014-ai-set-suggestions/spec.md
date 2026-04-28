# Feature Specification: Briefing com IA em /sets/[id]/montar

**Feature Branch**: `014-ai-set-suggestions`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "Inc 1 — Botão '✨ Sugerir com IA' em /sets/[id]/montar. IA lê briefing + faixas selecionadas filtradas pelos montar_filters_json + faixas já em set_tracks. Retorna lista ranqueada com justificativa em JSON. DJ adiciona uma a uma manualmente (sem 'aplicar tudo'). IA propõe complementos, NUNCA remove faixas existentes. Pré-requisito Inc 14."

## Clarifications

### Session 2026-04-28

- Q: Quantos candidatos no máximo enviar pra IA (L3 do prompt)? E qual critério de truncamento? → A: Ceiling de 50 candidatos no L3. Quando elegíveis ≤ 50, manda todos. Quando > 50, ordena por "mais bem-curadas" (score = quantos campos AUTHOR de track preenchidos: bpm, musicalKey, energy, moods, contexts, comment, ai_analysis) e trunca top 50. **L2 (faixas atuais do set) NÃO tem ceiling** — todas vão sempre, pra IA evitar duplicatas e entender contexto, mesmo em sets grandes (60+ faixas).
- Q: Layout do painel de sugestões em `/sets/[id]/montar`? → A: Bloco vertical abaixo do briefing, acima da listagem manual de candidatos. **Reusa o componente `<CandidateRow>` existente** com prop opcional pra adicionar badge "✨ Sugestão IA" + justificativa em itálico abaixo dos metadados. Mantém DRY e UX consistente com a listagem manual.
- Q: Número alvo de sugestões por geração? → A: 5-10 sugestões. Faixa enxuta pra DJ revisar sem fadiga; IA tem instrução explícita no prompt pra ficar nesse intervalo (pode ir abaixo se catálogo elegível for muito pequeno).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Receber sugestões iniciais para um set vazio (Priority: P1)

DJ criou um set novo, preencheu o briefing ("Festa de aniversário 30
anos, mistura MPB clássica + indie atual, 18h-23h, energia
crescente"), aplicou alguns filtros (estilos: MPB, Indie Rock), mas
ainda não adicionou nenhuma faixa. Clica "✨ Sugerir com IA" e em
~10-30s aparece um painel com 10-15 cards: cada um mostra uma faixa
candidata + justificativa curta em itálico ("Encaixa no warm-up
solar pelo BPM 95 e tom maior"). DJ revisa, decide quais quer e
adiciona uma a uma via botão "Adicionar ao set" em cada card.

**Why this priority**: É o caso fundador — IA ajuda quando o DJ
está com a página em branco e não sabe por onde começar. Sem isso,
nenhuma promessa do Inc 1 entrega.

**Independent Test**: a partir de set vazio com briefing preenchido
e ≥20 faixas selected matching filtros, clicar botão. Esperar
painel com ≥3 sugestões válidas (todas dentro do catálogo elegível)
em ≤30s. Adicionar 2-3 manualmente; cada uma vai pra `set_tracks`
sem afetar as outras.

**Acceptance Scenarios**:

1. **Given** DJ tem config de IA ativa (Inc 14), set com briefing
   preenchido E ≥20 faixas elegíveis (selected=true matching
   filtros, fora do set), **When** clica "✨ Sugerir com IA",
   **Then** painel de sugestões aparece em ≤30s com 5-10 cards
   ranqueados.
2. **Given** sugestões visíveis, **When** DJ clica "Adicionar ao
   set" em uma das sugestões, **Then** a faixa é adicionada a
   `set_tracks` (com order incrementado), o card mostra estado
   "✓ adicionada" mas permanece visível (DJ pode reler a
   justificativa).
3. **Given** DJ NÃO tem config de IA, **When** abre `/sets/[id]/montar`,
   **Then** botão "✨ Sugerir com IA" aparece desabilitado com
   tooltip "Configure sua chave em /conta".

---

### User Story 2 — Sugestões complementam set já em construção (Priority: P1)

DJ tem set em montagem com 8 faixas adicionadas. Quer descobrir o
que mais cabe sem revisitar o catálogo manualmente. Clica "✨
Sugerir com IA". A IA enxerga as 8 faixas atuais (artistas,
metadados) e propõe complementos coerentes — explicitamente NÃO
duplica faixas que já estão no set, NÃO sugere remover nada.

**Why this priority**: É o caso de uso mais frequente em refinamento
de set. Se IA propusesse duplicatas ou tentasse reescrever set
inteiro, fricção e desconfiança matariam adoção.

**Independent Test**: set com ≥5 faixas em `set_tracks`. Clicar
botão. Confirmar via inspeção: zero `trackId` da resposta da IA
coincide com tracks já em `set_tracks`. Justificativas mencionam
diálogo com faixas atuais ("Casa com a abertura de [artista do set
atual]").

**Acceptance Scenarios**:

1. **Given** set tem ≥5 faixas em `set_tracks`, **When** DJ clica
   "✨ Sugerir com IA", **Then** nenhuma sugestão tem `trackId` que
   já está em `set_tracks` (zero duplicação).
2. **Given** mesma situação, **When** sugestões aparecem,
   **Then** justificativas referenciam faixas/artistas do set
   atual quando faz sentido contextualmente (não obrigatório em
   100% dos cards).

---

### User Story 3 — Re-gerar sugestões substitui as anteriores (Priority: P2)

DJ recebeu primeira lista, adicionou algumas, descartou outras
mentalmente. Quer outra leva (talvez ajustou briefing, ou só quer
ver alternativas). Clica "✨ Sugerir com IA" de novo. Se ainda há
sugestões não-adicionadas no painel, sistema confirma antes de
substituir ("Você tem N sugestões ainda não adicionadas. Substituir
por novas?").

**Why this priority**: Higiene de UX. Sem confirmação, DJ perde
sugestões que ainda estava avaliando. Não é P1 porque MVP entrega
valor com a primeira geração.

**Independent Test**: gerar lista 1, adicionar parte, deixar outras
visíveis, clicar botão de novo. Confirmar diálogo aparece. Cancelar
→ lista antiga persiste. Confirmar → lista nova substitui.

**Acceptance Scenarios**:

1. **Given** painel com ≥1 sugestão não-adicionada visível,
   **When** DJ clica "✨ Sugerir com IA" de novo, **Then** sistema
   pede confirmação ("Substituir as N sugestões pendentes por uma
   nova lista?").
2. **Given** confirmação aceita, **When** nova lista vem do
   provider, **Then** sugestões antigas (mesmo as adicionadas)
   são substituídas pela nova lista.
3. **Given** painel vazio (todas adicionadas ou primeiro clique),
   **When** DJ clica "✨ Sugerir com IA", **Then** geração roda sem
   diálogo.

---

### User Story 4 — IA respeita filtros aplicados (Priority: P2)

DJ aplicou filtros (estilo=MPB, BPM 90-110, mood=solar) na barra de
filtros do `/montar`. A IA recebe APENAS faixas que passam nesses
filtros como catálogo elegível — não sugere coisas fora do recorte
que o DJ deliberadamente excluiu.

**Why this priority**: Confiança. Se IA ignorar filtros, o DJ vai
desabilitá-la mentalmente.

**Independent Test**: aplicar filtro estreito (ex: estilo único),
gerar sugestões, confirmar via SQL/inspeção que todos os
`trackId` retornados pertencem a records que matcham o filtro.

**Acceptance Scenarios**:

1. **Given** DJ aplicou filtro `style=MPB` na barra do `/montar`,
   **When** clica "✨ Sugerir com IA", **Then** 100% das sugestões
   pertencem a records com "MPB" em `records.styles`.
2. **Given** filtro tão restritivo que produz 0 candidatos elegíveis,
   **When** DJ clica botão, **Then** mensagem clara aparece
   ("Nenhum candidato elegível com os filtros atuais — relaxe os
   filtros e tente de novo") sem chamar provider de IA.

---

### Edge Cases

- **Briefing vazio**: IA recebe prompt sem L1 contexto. Aceitável
  — sugestões serão genéricas baseadas em metadados. NÃO bloquear.
- **Set vazio + filtros vazios**: catálogo elegível = todas as
  selected do user. IA recebe prompt grande. Truncar lista pra
  ~50-80 candidatos por motivos de tamanho de prompt (ranquear
  por `updatedAt` ou aleatório se exceder).
- **IA retorna JSON inválido**: parse com Zod, falha → erro
  tratado ("IA retornou resposta em formato inesperado — tente
  novamente"). Sem persistir nada.
- **IA retorna `trackId` que não existe no catálogo elegível**
  (alucinação): filtrar antes de mostrar. Logar pra debug. Se
  filtragem zerar resultado, erro tratado.
- **IA repete o mesmo `trackId` várias vezes**: deduplicar
  client/server-side antes de mostrar.
- **IA propõe `trackId` que JÁ está em `set_tracks`** (apesar do
  prompt explícito): filtrar antes de mostrar. Não confiar
  cegamente no provider.
- **Falha do provider** (key inválida, rate limit, timeout):
  mensagem contextual reusando mapping do Inc 14.
- **Multi-user isolation**: `suggestSetTracks(setId)` valida
  ownership do set; só candidatos do user corrente entram no
  catálogo.
- **Track removido entre geração e clique em "Adicionar"**:
  `addTrackToSet` (existente) já valida ownership; em caso de
  race, mostra erro "Faixa não encontrada".
- **Catálogo elegível com 0 candidatos** (filtros estreitos demais
  ou acervo vazio de selected): erro tratado antes de chamar
  provider. Custo zero.
- **Briefing com >2000 chars**: aceitar e truncar visualmente no
  prompt (manter primeiras 2000); custo de tokens não-crítico.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST oferecer botão "✨ Sugerir com IA" na
  rota de montagem de set (`/sets/[id]/montar`), claramente
  distinto da listagem manual de candidatos.
- **FR-002**: Sem config de IA ativa (Inc 14), botão MUST ficar
  desabilitado com tooltip indicando rota de configuração.
- **FR-003**: Geração MUST receber: (a) briefing do set,
  (b) lista **completa** de faixas atualmente em `set_tracks` do
  set (artista/título/posição) — sem ceiling, mesmo em sets
  grandes; (c) catálogo elegível = faixas com `selected=true` do
  user, filtradas pelos `montar_filters_json` do set, excluindo
  as que já estão em `set_tracks`. Catálogo MUST ser truncado em
  50 candidatos quando exceder; truncamento MUST priorizar
  faixas com mais campos AUTHOR preenchidos (bpm, musicalKey,
  energy, moods, contexts, comment, ai_analysis).
- **FR-004**: Resposta MUST ser parseada como lista estruturada
  com `trackId` (referência ao catálogo elegível) +
  `justificativa` (texto curto) por sugestão. Falhas de parse
  MUST ser tratadas com erro contextual.
- **FR-005**: Sugestões retornadas MUST ser filtradas para
  garantir que cada `trackId`: (a) existe no catálogo elegível,
  (b) pertence ao user corrente, (c) NÃO está já em `set_tracks`
  do set (anti-duplicação defensiva).
- **FR-006**: UI MUST exibir cada sugestão **reusando o componente
  existente de candidato** (`<CandidateRow>`) com extensão visual:
  badge "✨ Sugestão IA" + justificativa em itálico abaixo dos
  metadados. Painel de sugestões fica em bloco vertical abaixo do
  briefing, acima da listagem manual de candidatos. Botão
  "Adicionar ao set" é o mesmo do componente existente — sem
  duplicar UI.
- **FR-007**: Cada botão "Adicionar ao set" MUST adicionar apenas
  aquela faixa ao set (1 ação por clique). Sistema NÃO MUST
  oferecer ação "Aplicar todas" / "Adicionar todas" / batch.
- **FR-008**: Após adicionar uma faixa via card de sugestão, o
  card MUST permanecer visível com estado "✓ adicionada"
  (justificativa segue acessível pra leitura).
- **FR-009**: Re-clicar "✨ Sugerir com IA" quando há sugestões
  pendentes não-adicionadas MUST exigir confirmação explícita
  antes de substituir a lista.
- **FR-010**: IA MUST tratar faixas atuais do set como contexto
  imutável — propõe COMPLEMENTOS, NUNCA propõe remover ou
  substituir faixas já adicionadas. Esta feature NÃO inclui
  refatoração de set.
- **FR-011**: Catálogo elegível com 0 candidatos MUST exibir
  mensagem clara ANTES de chamar provider (zero custo de tokens).
- **FR-012**: Falhas do provider (chave inválida, rate limit,
  timeout, modelo não disponível) MUST exibir mensagem contextual
  reusando o mapeamento do Inc 14.
- **FR-013**: Geração e adição MUST ser ações exclusivas do user
  dono do set (multi-user isolation via ownership check).
- **FR-014**: Tempo total da geração (clique → cards visíveis)
  MUST ser tipicamente ≤30 segundos em condições normais. Em
  caso de travamento do provider, sistema MUST falhar em até 60
  segundos com mensagem contextual.

### Key Entities

Sem novas entidades. Reutiliza:
- **Set** (com `briefing`, `montarFiltersJson`)
- **SetTrack** (junção set-faixa, com `order`)
- **Track** (filtra por `selected=true`)
- **Record** (multi-user isolation, filtros de gênero/estilo)

Estado novo no client (não persistido):
- **Lista de sugestões em memória**: array de `{ trackId, justificativa, status: 'pending' | 'added' }`. Substituída a cada nova geração.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ recebe primeira lista de sugestões em ≤30 segundos
  desde clique do botão (medido pelo tempo até cards renderizarem
  na UI).
- **SC-002**: Em 10 gerações consecutivas com sets diversos
  (briefings diferentes, com e sem faixas atuais), 100% das
  respostas produzem ≥3 sugestões válidas (após filtros de
  segurança).
- **SC-003**: Zero duplicação: em 10 gerações com set já
  populado, 100% das sugestões têm `trackId` distintos das
  faixas em `set_tracks`.
- **SC-004**: Filtros aplicados respeitados: 100% das sugestões
  pertencem ao recorte de filtros ativo.
- **SC-005**: Adicionar uma sugestão NÃO afeta outras sugestões
  visíveis (cada card é independente). Cards adicionados
  permanecem visíveis com estado "✓ adicionada".
- **SC-006**: Catálogo elegível vazio NÃO consome tokens de IA
  (verificável via inspeção: zero chamada ao provider quando
  candidatos = 0).
- **SC-007**: Multi-user isolation verificável via teste manual
  com 2 contas: DJ A não consegue gerar sugestões pra set do
  DJ B.

## Assumptions

- Inc 14 (BYOK) já está em produção. Esta feature consome a
  infraestrutura de adapter (`getAdapter`, `getUserAIConfig`)
  ou função pública `enrichTrackComment` adaptada para retorno
  estruturado.
- Catálogo elegível pode ser truncado a ~50-80 candidatos pra
  controlar tamanho do prompt. Ordem de truncamento (mais
  recente primeiro / aleatória / por relevância) é decisão de
  plan.
- Resposta da IA vem em formato JSON inline; parse defensivo
  extrai bloco JSON mesmo se IA envolver em prosa
  (anti-fragilidade contra variações de modelo).
- Sem histórico/cache de sugestões — cada geração é fresh.
  Re-clique sempre chama provider novamente. Se virar dor,
  abrir spec separada.
- Sem batch ("Adicionar todas as N sugestões") — fora de escopo
  e contrário ao princípio do feedback do mantenedor ("DJ
  raramente acata 100%").
- Sem refatoração ("remover faixa atual do set por sugestão da
  IA") — fora de escopo, Inc futuro.
- Sem ranking de sugestões com base em histórico do DJ ("você
  tende a aceitar X tipo de sugestão") — overkill pro piloto.
- Tempo de geração esperado 10-30s pelo volume do prompt
  (briefing + ~50 candidatos com metadados); SC-001 reflete
  ceiling razoável.
- Bloco visual das sugestões pode ficar abaixo do briefing OU
  como sidebar/drawer — decisão de layout fica pro plan.
- Sem schema delta. Toda mudança é em src/lib/actions.ts +
  src/lib/prompts/ + src/components/ + src/app/sets/[id]/montar/.
