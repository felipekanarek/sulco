# Feature Specification: Análise da faixa via IA

**Feature Branch**: `013-ai-track-analysis`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "Inc 13 — Botão '✨ Analisar com IA' por faixa em `/disco/[id]`. IA gera análise musical e preenche `tracks.ai_analysis` (campo NOVO, separado de `tracks.comment` que é nota humana). Disparo manual. Re-gerar com confirmação se já há conteúdo. Limite ~500 chars via prompt + max_tokens. Pré-requisito: Inc 14 (config BYOK)."

## Clarifications

### Session 2026-04-28

- Q: Bloco "Análise" aparece quando `ai_analysis` está vazio? → A: Sim, sempre visível como placeholder ("Sem análise — clique no botão pra gerar com IA"). Estado vazio + botão integrados, sem reflow ao gerar primeira análise.
- Q: Botão "Analisar com IA" aparece em todas as faixas ou só `selected=true`? → A: Em todas as faixas. Análise é informativa e ajuda DJ a decidir se faixa vira `selected`. Restringir só a selected cria ovo-galinha (DJ precisa decidir antes de saber).
- Q: Posição do botão "✨ Analisar com IA" no card? → A: Dentro do bloco "Análise" (não inline com Deezer/Spotify/YouTube do Inc 008). Isola função de IA dos botões de preview de áudio, evita estourar layout em mobile, e mantém o ponto de entrada da feature visualmente associado ao seu output.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Gerar análise pela primeira vez (Priority: P1)

DJ está em `/disco/[id]`, vê um track sem análise da IA, clica em
"✨ Analisar com IA" e em ~3-8s aparece um parágrafo curto em pt-BR
descrevendo a sensação musical, contexto e uso em set. Texto fica
visível como "Análise" no card da faixa, separado da nota manual
(`comment`) que ele escreveu antes.

**Why this priority**: É o fluxo fundador da feature. Sem essa parte
nada da promessa do Inc 13 existe. DJ que tinha medo de "queimar
token" e perder texto manual agora tem confiança porque o campo é
isolado.

**Independent Test**: a partir de track com `ai_analysis = NULL`,
clicar no botão. Resposta volta em ≤10s. DB confirma
`tracks.ai_analysis` preenchido com texto curto pt-BR. Campo
`tracks.comment` permanece intocado (validar via SQL antes/depois).

**Acceptance Scenarios**:

1. **Given** DJ tem config de IA ativa (Inc 14) E faixa tem
   `ai_analysis = NULL`, **When** clica em "✨ Analisar com IA",
   **Then** o botão entra em estado pendente, em ≤10s o card mostra
   o texto da análise dentro de um bloco "Análise" e
   `tracks.ai_analysis` é persistido.
2. **Given** mesma situação, **When** a análise é gerada,
   **Then** `tracks.comment` (nota manual humana) permanece
   inalterado.
3. **Given** DJ NÃO tem config de IA ativa (Inc 14 não configurado),
   **When** abre `/disco/[id]`, **Then** o botão "✨ Analisar com IA"
   aparece desabilitado com tooltip "Configure sua chave em /conta".

---

### User Story 2 — Re-gerar análise existente (Priority: P1)

DJ olhou a primeira análise e não gostou — quer regenerar (talvez
mudou de modelo no Inc 14, ou só quer outro take). Clica de novo no
botão. Como já há texto, sistema confirma antes de sobrescrever.

**Why this priority**: Espelha o pattern já usado no Inc 14 (trocar
provider apaga key). Evita destruir uma análise que o DJ tinha
editado manualmente sem perceber.

**Independent Test**: track com `ai_analysis` preenchido. Clicar no
botão → confirmação aparece. Confirmar → texto antigo é substituído
pelo novo. Cancelar → texto antigo permanece.

**Acceptance Scenarios**:

1. **Given** track com `ai_analysis` não-vazio, **When** DJ clica em
   "✨ Analisar com IA" novamente, **Then** o sistema mostra
   confirmação "Substituir análise existente?".
2. **Given** confirmação aceita, **When** a nova análise é gerada,
   **Then** `tracks.ai_analysis` é sobrescrito pelo texto novo.
3. **Given** confirmação cancelada, **When** o estado da UI é
   restaurado, **Then** `tracks.ai_analysis` permanece com o texto
   anterior, sem chamada ao provider.

---

### User Story 3 — Editar análise manualmente (Priority: P2)

DJ leu a análise gerada pela IA, gostou de 80% mas quer corrigir
uma frase específica. Clica no texto da análise e edita
diretamente — mesma UX do `comment` manual. Salva ao tirar foco do
campo.

**Why this priority**: É a "válvula de escape" da promessa "IA
escreve, DJ pode editar livremente". Sem isso, qualquer imperfeição
da IA vira refazer-do-zero. Não é P1 porque MVP entrega a geração;
edição é polish.

**Independent Test**: track com `ai_analysis` preenchido. Editar
diretamente o texto. Sair do campo (blur) → DB salva o novo valor.
Re-renderizar a página → texto editado persiste.

**Acceptance Scenarios**:

1. **Given** track com `ai_analysis` gerado, **When** DJ clica no
   texto e edita, **Then** o textarea fica em modo edição com o
   valor atual.
2. **Given** DJ saiu do campo após editar, **When** o sistema
   detecta blur com mudança, **Then** `tracks.ai_analysis` é
   salvo com o novo texto.
3. **Given** DJ regenerar com IA depois de uma edição manual,
   **When** clica "✨ Analisar com IA" e confirma a substituição,
   **Then** edição manual é sobrescrita pela nova geração (mesmo
   fluxo da US2).

---

### User Story 4 — Análise vazia ao limpar texto (Priority: P3)

DJ editou o `ai_analysis`, apagou tudo e saiu do campo. Esperado:
campo volta a `NULL` no DB e visualmente o card volta ao estado
"sem análise" (mostra botão "✨ Analisar com IA" sem texto acima).

**Why this priority**: Caso de borda de hygiene. DJ que quer remover
uma análise ruim sem regenerar (ex: faixa muito obscura onde IA não
acerta) deve poder.

**Independent Test**: track com `ai_analysis` preenchido. Apagar
todo texto manualmente, blur. SQL confirma `ai_analysis = NULL`.

**Acceptance Scenarios**:

1. **Given** track com `ai_analysis` não-vazio, **When** DJ apaga
   tudo e blur, **Then** `tracks.ai_analysis` vira `NULL`. Card
   volta ao estado "sem análise".

---

### Edge Cases

- **DJ sem `comment` mas com `ai_analysis`**: card mostra os 2
  blocos. Bloco "Análise" tem texto; bloco "Sua nota" mostra
  placeholder pra DJ saber que pode escrever (espelha o pattern
  da decisão Q1: blocos sempre visíveis).
- **DJ com ambos `comment` e `ai_analysis`**: card mostra os 2
  blocos lado a lado (desktop) ou empilhados (mobile, alinha com
  Inc 009).
- **IA retorna texto > 500 chars**: aceitar e salvar como veio
  (sem truncate destrutivo). Hard limit do `max_tokens` no SDK
  já controla.
- **IA retorna texto vazio ou só whitespace**: tratar como erro
  ("IA retornou resposta vazia — tente novamente"). Não salvar.
- **Falha do provider** (key inválida, rate limit, timeout): exibir
  mensagem contextual reusando mapping do Inc 14 (`AdapterError`).
  Não persistir nada.
- **DJ mudou config de IA depois de gerar análise**: análise antiga
  permanece. Nova chamada usa novo provider/modelo.
- **Track removido da coleção pós-análise**: `ai_analysis` é apagado
  via cascade do `tracks` → `records` (mesma regra que outros
  campos AUTHOR de track).
- **Multi-user isolation**: track só é analisado se pertence a
  record do user corrente. Server Action faz ownership check
  explícito.
- **Botão habilitado ↔ desabilitado em tempo real**: se DJ acabou
  de configurar IA em outra aba, o estado do botão na aba aberta
  fica defasado até reload. Aceitável (estado server-side via
  RSC; revalidação requer refresh).
- **Análise de faixa MUITO conhecida vs MUITO obscura**: nada
  específico — IA pode hallucinar em obscuras. Prompt instrui
  "Não invente fatos" mas não há garantia. Risco aceito.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST oferecer um botão dedicado por faixa em
  `/disco/[id]` para gerar análise via IA, claramente distinto do
  campo de nota manual. O botão MUST viver dentro do bloco "Análise"
  (que está sempre visível, mesmo com `ai_analysis` vazio,
  funcionando como placeholder + ponto de entrada). O botão NÃO MUST
  ser colocado inline com os botões de preview de áudio do Inc 008
  (Deezer/Spotify/YouTube) — semantica e layout distintos.
- **FR-002**: A análise gerada MUST ser persistida em campo
  separado da nota manual; geração da IA NUNCA escreve em
  `tracks.comment`.
- **FR-003**: Sem config de IA ativa (Inc 14), o botão MUST ficar
  desabilitado com tooltip indicando rota de configuração.
- **FR-004**: Re-geração com IA quando já há análise persistida
  MUST exigir confirmação explícita antes de sobrescrever.
- **FR-005**: DJ MUST poder editar o conteúdo da análise
  manualmente após geração — mesmo padrão UX que o campo de nota
  manual.
- **FR-006**: Apagar todo o texto da análise (manual edit pra
  vazio) MUST resultar em campo persistido como NULL.
- **FR-007**: Geração MUST montar o prompt com contexto disponível
  da faixa: artista, álbum, ano, título, posição; e quando
  presentes, gêneros/estilos/BPM/tom/energia.
- **FR-008**: Prompt MUST instruir saída em pt-BR, máximo 500
  caracteres, 3-4 frases curtas, foco em sensação musical e uso
  em set, sem inventar fatos biográficos.
- **FR-009**: Falhas do provider (chave inválida, rate limit,
  timeout, modelo não disponível) MUST exibir mensagem contextual
  reusando o mapeamento estabelecido no Inc 14.
- **FR-010**: Geração e edição MUST ser ações exclusivas do user
  dono da faixa (multi-user isolation via ownership check).
- **FR-010a**: Botão "Analisar com IA" MUST aparecer em todas as
  faixas listadas em `/disco/[id]`, independente do flag `selected`.
  Análise antecede a decisão de selecionar pra repertório — DJ usa
  IA pra ajudar a triar.
- **FR-011**: Resposta vazia ou só whitespace do provider MUST ser
  tratada como erro ("IA retornou resposta vazia — tente novamente"),
  sem persistir.
- **FR-012**: Tempo total da geração (clique → análise visível) MUST
  ser tipicamente ≤10 segundos em condições normais. Em caso de
  travamento do provider, sistema MUST falhar em até 30 segundos
  com mensagem "Provider não respondeu — tente novamente" (timeout
  hard via `Promise.race` na Server Action), evitando DJ esperar
  os 60s de limite do runtime serverless.

### Key Entities

- **Track AI Analysis** (anexa em `tracks`): texto livre nullable
  (`ai_analysis`). Campo AUTHOR híbrido — IA escreve via clique
  do DJ; DJ pode editar livremente. NUNCA escrito por sync de
  fonte externa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ gera análise da primeira faixa em ≤30 segundos
  desde abrir `/disco/[id]` (incluindo identificar a faixa, clicar,
  ver resposta).
- **SC-002**: Em 10 gerações consecutivas com diferentes faixas
  populares (Tom Jobim, Caetano, Marisa Monte etc.), 100% retornam
  texto coerente em pt-BR e dentro de ~500-800 caracteres.
- **SC-003**: Zero contaminação cruzada entre `comment` (nota
  manual) e `ai_analysis` em qualquer cenário — DJ pode confirmar
  via inspeção visual e SQL que os 2 campos são independentes.
- **SC-004**: 100% das tentativas de re-gerar análise existente
  passam por confirmação explícita antes de sobrescrever.
- **SC-005**: Multi-user isolation verificável via teste manual
  com 2 contas: DJ A não consegue gerar nem ler `ai_analysis` de
  faixas do DJ B.
- **SC-006**: Sem config de IA, o botão permanece visível mas
  desabilitado em 100% das renderizações da página.

## Assumptions

- Inc 14 (BYOK) já está em produção. Esta feature consome a função
  pública `enrichTrackComment(userId, prompt)` que retorna texto
  pt-BR usando o provider/modelo configurado pelo DJ.
- O nome `ai_analysis` reflete a origem da escrita (IA é fonte
  primária), embora DJ possa editar. Manter o nome mesmo após
  edição manual evita schema rename. Trade-off aceito.
- Soft limit de 500 caracteres no prompt + hard limit `max_tokens`
  no SDK reduzem suficientemente o tamanho de resposta. Não há
  truncate destrutivo no servidor.
- Visual: bloco "Análise" usa eyebrow `font-mono uppercase` simples
  com label "Análise"; sem mostrar provider/model na UI (ruído
  desnecessário pro DJ).
- Edição manual segue o mesmo pattern auto-save-on-blur do `comment`
  já existente — DJ não precisa clicar "Salvar".
- Sem histórico/versionamento de análise. Cada geração sobrescreve
  a anterior. Se virar dor real, abrir spec separada.
- Sem batch ("analisar todas as faixas selected do disco" ou
  "analisar disco inteiro") — fora de escopo. Inc futuro.
- Esta feature **não** mostra contador de tokens consumidos. DJ
  monitora uso na conta do provider (alinha com decisão do Inc 14).
- Schema delta é aditivo (1 coluna nullable em `tracks`); aplicar
  via sqlite3 local + Turso CLI prod (mesmo padrão Inc 010/012).
