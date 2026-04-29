# Feature Specification: Análise IA + glyph de expandir nos cards de candidato

**Feature Branch**: `018-candidate-ai-analysis-glyph`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "Inc 17 — Análise IA + ícone de expandir nos cards de candidato. Ajustes UX no `<CandidateRow>` em `/sets/[id]/montar`: (1) exibir `tracks.ai_analysis` no bloco expandido (campo já existe desde Inc 13 mas não é selecionado); (2) trocar glyph `▸`/`▾` que parece botão de play. Sem schema delta."

## Summary

Hoje em `/sets/[id]/montar`, o `<CandidateRow>` (componente único da
listagem de candidatos) tem 2 atritos UX que esta feature resolve:

1. **Análise IA invisível na decisão de set**. O campo `tracks.ai_analysis`
   (Inc 13, AUTHOR híbrido) já é uma das informações curatoriais mais
   ricas do projeto e está exibido em `/disco/[id]`. Mas no `/montar` o
   `<CandidateRow>` nem carrega o campo — DJ perde acesso a contexto
   relevante na hora de decidir se a faixa entra no set. Há também uma
   incoerência atual: `queryCandidates` referencia `aiAnalysis` no
   `rankByCuration` (score de "mais bem-curadas") mas não seleciona o
   campo da tabela — o score conta sem mostrar.
2. **Glyph de expandir confunde com botão de play**. O `▸` (collapsed)
   /`▾` (expanded) é visualmente próximo de `▶`. DJ familiarizado com
   os botões de preview de áudio (Inc 008 — `▶ Deezer`) pode clicar
   esperando tocar a faixa.

Esta feature entrega 2 ajustes pequenos: (a) carregar e exibir
`aiAnalysis` em modo leitura no expandido do candidato, e (b) trocar
o glyph por um par sem ambiguidade.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ler análise IA enquanto monta set (Priority: P1)

DJ está em `/sets/[id]/montar` decidindo quais candidatas entram. Numa
faixa específica que ele não lembra bem, expande o card. Logo abaixo
dos campos curatoriais já existentes (comment, references, mood,
context, fineGenre), aparece a seção **"Análise"** com o texto que a
IA gerou na curadoria do disco (ou que o DJ refinou manualmente em
`/disco/[id]`). DJ lê, decide, fecha o expandido e clica "Adicionar
ao set" — ou pula pra próxima.

**Why this priority**: é o caso fundador da feature. A análise IA é
uma das maiores entregas de valor de 2026 (Inc 13) e estava
literalmente invisível no momento em que o DJ mais precisa: decidir
o set. P1 porque resolve a falha funcional principal.

**Independent Test**: a partir de uma faixa que tem `ai_analysis`
preenchido no DB, abrir `/sets/[id]/montar`, encontrar o
`<CandidateRow>` daquela faixa, expandir. Bloco "Análise" deve
mostrar o texto. Em outra faixa sem `ai_analysis`, expandir não
deve mostrar a seção (sem placeholder).

**Acceptance Scenarios**:

1. **Given** uma faixa candidata com `tracks.ai_analysis` preenchido,
   **When** DJ expande o card no `/sets/[id]/montar`, **Then** uma
   seção "Análise" aparece no bloco expandido (logo abaixo de
   comment/references), com o texto íntegro e formatação preservada
   (quebras de linha respeitadas).
2. **Given** uma faixa candidata SEM `tracks.ai_analysis` (NULL ou
   string vazia), **When** DJ expande o card, **Then** a seção
   "Análise" NÃO renderiza (sem placeholder, sem mensagem). DJ vai
   pra `/disco/[id]` se quiser gerar/editar.
3. **Given** o expandido do candidato está aberto com a Análise
   visível, **When** DJ tenta clicar/editar a Análise, **Then** o
   campo é apenas leitura — sem `<textarea>`, sem botão "Editar",
   sem botão "✨ Analisar com IA". Edição segue exclusivamente em
   `/disco/[id]`.

---

### User Story 2 — Glyph de expandir não confunde com play (Priority: P1)

DJ está em `/sets/[id]/montar` e os cards têm botões de preview de
áudio (▶ Deezer / ↗ Spotify / ↗ YouTube — Inc 008) e um botão de
expandir/colapsar separado. Hoje o glyph de expandir é `▸` que
parece play e gera confusão. Após esta feature, o glyph muda para
um par sem ambiguidade — `+` (collapsed) / `−` (expanded) — para
que ninguém clique esperando tocar.

**Why this priority**: ambiguidade de affordance é bug de UX que
afeta todo card. Princípio V (Mobile-Native): em mobile a
diferença entre glyphs vira ainda mais crítica porque o tap é
gestual e o DJ não vê hover state. P1 porque é regressão de
clareza desde que Inc 008 introduziu botões de play visuais.

**Independent Test**: abrir `/sets/[id]/montar` num set com
candidatos. Inspecionar visualmente o botão de expandir de
qualquer card — ele NÃO mostra `▸` nem `▾`. Mostra `+` (estado
colapsado) ou `−` (estado expandido). Clicar alterna entre os
dois. Nenhum botão de play (Deezer/Spotify/YouTube) é tocado por
acidente.

**Acceptance Scenarios**:

1. **Given** card colapsado, **When** DJ olha pro botão de expandir,
   **Then** o glyph é `+` (claramente "abrir", sem similaridade com
   `▶`).
2. **Given** card expandido, **When** DJ olha pro mesmo botão,
   **Then** o glyph é `−` (claramente "fechar/colapsar").
3. **Given** card colapsado, **When** DJ clica no botão `+`, **Then**
   o card expande (mostrando todos os blocos curatoriais incluindo
   a nova seção "Análise" da User Story 1) e o glyph muda para `−`
   sem que nenhum áudio comece a tocar.
4. **Given** o usuário usa leitor de tela ou navegação por teclado,
   **When** focar/anunciar o botão, **Then** existe label
   acessível ("Expandir detalhes" / "Recolher detalhes" via
   `aria-label` ou `aria-expanded`) — preservar acessibilidade que
   o glyph anterior já dava.

---

### Edge Cases

- **Análise muito longa** (>1000 chars): texto preservado integralmente,
  sem truncamento, sem CSS de "ver mais". Scroll natural do card
  expandido absorve. Bloco respeita whitespace-preserving para
  preservar quebras de linha.
- **Análise com markdown ou HTML**: tratada como texto puro (mesma
  política de `/disco/[id]`). Sem renderização de markdown nem
  sanitização especial — campo é sempre escrito por pipeline IA ou
  digitação humana, ambos texto plano.
- **Faixa adicionada como sugestão IA do Inc 014/015** (com
  justificativa): seção "Análise" continua aparecendo independente
  da justificativa da sugestão. São coisas distintas — sugestão é
  por que ela cabe no set; análise é diagnóstico curatorial geral.
- **Mobile (≤640px, Princípio V)**: bloco "Análise" herda o layout
  do expandido (já responsivo desde Inc 015/016). Tap target do
  glyph mantém ≥44×44 px (já era).
- **Glyph com fonte não-padrão**: `+`/`−` são caracteres ASCII
  básicos, suportados em qualquer fontstack. Sem risco de fallback
  estranho.
- **Race entre DJ refinar análise em /disco/[id] e voltar pra
  /montar**: revalidação automática do RSC ao DJ navegar de volta
  já cobre — `<CandidateRow>` lê snapshot novo. Sem mudança nesta
  feature.

## Requirements *(mandatory)*

### Functional Requirements

#### Parte 1 — Exibir Análise IA no candidato expandido

- **FR-001**: Sistema MUST carregar o campo `aiAnalysis` da faixa
  ao listar candidatos em `/sets/[id]/montar` — corrigindo a
  incoerência atual em que o score de curadoria já considera o
  campo mas a query não o seleciona.
- **FR-002**: O bloco expandido do `<CandidateRow>` MUST exibir uma
  seção "Análise" mostrando `aiAnalysis` quando o valor for não-vazio
  (string não-nula com pelo menos 1 char não-whitespace).
- **FR-003**: Quando `aiAnalysis` for vazio (NULL ou só whitespace),
  a seção "Análise" MUST ser totalmente omitida (não renderizar
  título, não renderizar placeholder, não exibir CTA pra gerar).
  DJ que quiser gerar análise navega para `/disco/[id]`.
- **FR-004**: A seção "Análise" no candidato MUST ser **apenas
  leitura** — sem campo editável, sem botão "Editar", sem botão
  "✨ Analisar com IA". Toda escrita continua exclusiva em
  `/disco/[id]`.
- **FR-005**: O texto da análise MUST preservar quebras de linha
  e espaçamento original (whitespace-preserving) para manter a
  legibilidade do diagnóstico curatorial.
- **FR-006**: A seção "Análise" MUST aparecer abaixo dos blocos
  existentes de comment/references no expandido, agrupada
  visualmente como mais uma facet curatorial.

#### Parte 2 — Trocar glyph de expandir

- **FR-007**: O botão de expandir/colapsar do `<CandidateRow>` MUST
  exibir o glyph `+` quando o card está colapsado e `−` quando
  está expandido.
- **FR-008**: Sistema MUST NÃO usar mais glyphs `▸`, `▾`, `▶` ou
  derivados de "triângulo" no botão de expandir, por conflitarem
  visualmente com o ícone de play universal usado nos botões de
  preview de áudio (Inc 008).
- **FR-009**: O botão de expandir MUST preservar acessibilidade —
  `aria-expanded` reflete o estado correto e/ou `aria-label`
  descreve a ação ("Expandir detalhes" / "Recolher detalhes") para
  leitores de tela.
- **FR-010**: O botão de expandir MUST manter tap target ≥44×44 px
  em todas as viewports (Princípio V — Mobile-Native).

### Key Entities

Sem novas entidades. Reutiliza:
- **Track** (`tracks.aiAnalysis`) — campo já existente desde Inc 13.
- **Candidate** (tipo TypeScript) — ganha 1 campo opcional
  `aiAnalysis`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma sessão real de montagem de set, DJ consegue
  ler a análise IA de uma faixa candidata sem sair de
  `/sets/[id]/montar` — zero navegação para `/disco/[id]` quando o
  objetivo é apenas consultar.
- **SC-002**: Em 100% das faixas com `ai_analysis` preenchido, a
  seção "Análise" aparece no expandido do candidato. Em 0% das
  faixas sem o campo, ela aparece (zero falsos placeholders).
- **SC-003**: Após a troca de glyph, em teste informal de
  reconhecimento (mostrar 2-3 cards a alguém) ninguém aponta o
  botão de expandir como "parece play". (Validação subjetiva,
  documentar no quickstart.)
- **SC-004**: Em mobile (375px-640px), o expandido com a seção
  "Análise" não causa scroll horizontal nem layout quebrado, e o
  novo glyph `+` / `−` mantém tap target ≥44×44 px verificável
  via DevTools.
- **SC-005**: A incoerência interna atual entre o ranking de
  candidatos (score que considera análise) e a UI (que não mostra
  análise) é resolvida — campo passa a ser carregado sempre que
  a listagem é montada, garantindo paridade entre o que pesa no
  ranking e o que é mostrado.

## Assumptions

- Glyph escolhido `+` / `−` não exige ratificação por
  `/speckit.clarify` — é decisão UX direta resolvida na spec
  (par textual mais claro, ASCII universal, sem competição com
  play). Se durante implementação o visual ficar pesado, ajuste
  é apenas CSS (peso/tamanho) — sem mudar a spec.
- "Análise" como título do bloco — mesmo termo usado em
  `/disco/[id]`, garantindo consistência léxica entre as duas
  rotas.
- O `<CandidateRow>` é usado **apenas** em `/sets/[id]/montar`
  hoje. Se virar reutilizável em outras rotas no futuro, a prop
  `aiAnalysis` continua opcional e a renderização condicional
  preserva compatibilidade.
- Sem schema delta. Sem novas Server Actions. A escrita do campo
  permanece exclusivamente nas actions do Inc 13.
- Princípio V respeitado por construção: glyphs ASCII funcionam
  idênticos em qualquer densidade de tela; bloco "Análise" herda
  responsividade já validada do expandido em Inc 015/016.
- Princípio I respeitado: `aiAnalysis` é AUTHOR híbrido; esta
  feature apenas exibe — não escreve, não chama IA, não modifica
  pipeline.
