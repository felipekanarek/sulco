# Research — Inc 17: Análise IA + glyph de expandir nos cards de candidato

**Feature**: 018-candidate-ai-analysis-glyph
**Date**: 2026-04-28

Decisões de design tomadas antes de Phase 1.

---

## Decisão 1 — Glyph para botão de expandir/colapsar

**Decision**: usar `+` (U+002B) quando colapsado e `−` (U+2212, minus
sign) quando expandido. Nada de glyphs do bloco "geometric shapes"
(`▸`/`▾`/`▶`/`▼`).

**Rationale**:
- `+`/`−` são universalmente reconhecidos como "abrir/fechar
  detalhe" — pattern usado em accordions desde os 2000.
- Sem similaridade visual com `▶` (play). Princípio V: em mobile
  (sem hover state) o DJ tem que distinguir affordances apenas
  pelo glyph; ambiguidade mata o tap.
- ASCII puro — nenhum risco de fontstack/fallback estranho. `−`
  é U+2212 (minus sign tipográfico) em vez de hífen `-` para
  contraste vertical próximo ao `+` (questão estética; ambos
  funcionam; minus signal é usado pra parear com `+` em UIs
  editoriais como NYT Magazine, alinhado à estética Sulco).
- A altura visual do `−` é mais leve que `▾`, mas o botão já tem
  border + padding do Tailwind — suficiente pra delimitar visualmente.

**Alternatives considered**:
- **Chevron `›` / `⌄`**: rejeitado — `›` tem orientação
  horizontal, ambígua em accordion vertical; e `⌄` não tem par
  visual (não existe versão "fechada" óbvia).
- **Label "Detalhes" + ícone direcional**: rejeitado — quebra o
  layout de ícone único; aumenta área do botão e gera reflow no
  card. Excede o escopo da feature.
- **Ícone SVG custom**: rejeitado — over-engineering; introduz
  asset novo. Spec proíbe libs de ícones ([CLAUDE.md](../../CLAUDE.md))
  e ASCII resolve.

---

## Decisão 2 — Comportamento de "análise vazia"

**Decision**: quando `aiAnalysis` for `null`, string vazia ou só
whitespace, a seção "Análise" inteira NÃO renderiza no expandido
do candidato. Sem placeholder. Sem CTA.

**Rationale**:
- DJ está em `/sets/[id]/montar` decidindo set, não curando faixa.
  CTA pra gerar análise quebraria o fluxo (clicar abre Server
  Action de IA, leva 30s, distrai do objetivo).
- `/disco/[id]` já é o lugar canônico pra gerar/editar análise
  (Inc 13). Manter o ato de geração lá centralizado evita
  divergência de estado e pega o user no contexto certo.
- Coerência com FR-003 do Inc 13 que diz "bloco aparece quando
  há conteúdo". Replicar essa regra em /montar mantém DJ com
  modelo mental único.

**Alternatives considered**:
- **Placeholder "Sem análise — clique para gerar"**: rejeitado.
  Quebra fluxo; Server Action longa; convida ao "drift" de
  curadoria pra dentro do montar.
- **Link "abrir curadoria"**: rejeitado pra "análise" mas já
  existe no expandido um link genérico
  `→ abrir curadoria` ([candidate-row.tsx:300-305](../../src/components/candidate-row.tsx#L300))
  que cobre quem quer ir gerar/editar. Suficiente.

---

## Decisão 3 — Posicionamento da seção "Análise" no bloco expandido

**Decision**: renderizar abaixo de comment/references, dentro da
mesma coluna (col-1 do grid 2-col já existente do expandido).
Antes do bloco de localização física (shelfLocation/recordNotes)
da col-2.

**Rationale**:
- Análise é facet curatorial **da faixa** (mesmo do que
  comment/references). Agrupar tudo na col-1 (fatos da faixa) e
  manter col-2 pra contexto de disco (shelfLocation/notes/link
  pra curadoria) preserva separação semântica do grid atual.
- Posicionar abaixo de comment respeita ordem de "curadoria do
  DJ → análise da IA" — alinhado com a sequência de leitura do
  DJ.

**Alternatives considered**:
- **Acima de comment**: rejeitado — análise IA precisa ser
  contextualizada pelo comment do DJ (humano primeiro), não vice-
  versa.
- **Coluna 2**: rejeitado — quebraria o agrupamento "fatos da
  faixa".

---

## Decisão 4 — Whitespace-preserving da análise

**Decision**: usar Tailwind `whitespace-pre-line` (mesmo aplicado
em `comment` e `recordNotes` no expandido atual).

**Rationale**:
- Texto de análise pode conter parágrafos curtos, listas com `-`,
  ou pausas com `\n\n` (vide prompt builder do Inc 13).
- `whitespace-pre-line` colapsa espaços horizontais em sequência
  mas preserva quebras `\n` — comportamento desejado.
- Consistência com como `comment` é exibido: visual coerente
  ("ah, esse bloco se comporta igual aos outros campos").

**Alternatives considered**:
- **`whitespace-pre`**: rejeitado — preserva espaços horizontais
  consecutivos, levando a layouts estranhos com tabulação acidental.
- **Sem tratamento**: rejeitado — quebras de linha somem,
  legibilidade despenca.

---

## Decisão 5 — Tap target do botão de toggle (Princípio V edge case)

**Decision**: **manter** o status quo:
`w-11 h-11 md:w-8 md:h-8` (44×44 mobile, 32×32 desktop).
Esta feature NÃO altera dimensões do botão.

**Rationale**:
- Princípio V (Inc 009 baseline) exige ≥44×44 em mobile —
  satisfeito com `w-11 h-11`.
- Desktop fica em 32×32 (clique de mouse com precisão pixel-
  level é aceito; pattern usado em outros botões de toggle do
  projeto).
- Refatorar tap target pra 44×44 também em desktop seria
  scope-creep — exigiria ajustar layout do header da linha onde o
  botão vive.
- Se virar dor (DJ apontar erro de clique em desktop), abre Inc
  novo — não nesta feature.

**Alternatives considered**:
- **Forçar 44×44 também em desktop**: rejeitado — visual fica
  pesado no card já compacto; scope-creep.
- **Diminuir mobile pra 36×36**: rejeitado — viola Princípio V.

---

## Decisão 6 — Não tocar em `rankByCuration`

**Decision**: NÃO mexer no algoritmo de score nem nas demais
queries que usam `rankByCuration`. Apenas adicionar `aiAnalysis`
ao SELECT da `queryCandidates`.

**Rationale**:
- O score já considera `aiAnalysis` corretamente
  ([montar.ts:127](../../src/lib/queries/montar.ts#L127)). A
  incoerência reportada na spec é "score considera mas SELECT não
  carrega" — resolvida puramente adicionando o campo ao SELECT.
- Não há razão pra retunar pesos ou adicionar normalização. Se
  algum dia for desejável (e.g., dar peso 2 pra análise IA), é
  Inc separado.

**Alternatives considered**:
- **Aumentar peso do `aiAnalysis` no score**: rejeitado — fora
  de escopo.
- **Remover `aiAnalysis` do score (pra reverter incoerência por
  baixo)**: rejeitado — perderia info útil de ranking pra IA.

---

## Decisão 7 — Estilo visual da seção "Análise" (cor/fonte)

**Decision**: usar a mesma stack visual de "comment" no
expandido — `label-tech text-ink-mute` no título; `font-serif
italic text-[13px] text-ink whitespace-pre-line` no corpo. SEM
borda de destaque, SEM aspas (use aspas só pra comment, que é
"voz do DJ"; análise IA é descritiva, não declarativa).

**Rationale**:
- Coerência com `<TrackCurationRow>` de `/disco/[id]` que usa
  pattern visual idêntico para o bloco "Análise".
- Aspas em comment (`"…"`) marcam a voz humana literal; análise
  IA não é "voz" — é diagnóstico, sem aspas.
- Sem border/badge accent porque o cabeçalho da seção
  ("Análise" em label-tech) já comunica o que é.

**Alternatives considered**:
- **Border accent / badge "✨ IA"**: rejeitado — clutter; usuário
  já entende contexto do título; "✨" no `/disco/[id]` é apenas
  no botão de geração, não no display.
- **Texto em fonte mono**: rejeitado — análise é prosa, fonte
  serif italic combina com o resto do bloco.

---

## Resumo

7 decisões resolvidas — sem NEEDS CLARIFICATION pendentes. Phase 1
procede com:
- 1 contrato em `contracts/ui-contract.md` (especifica visual e
  ARIA do componente pós-refactor).
- 1 quickstart com cenários incluindo mobile + leitor de tela.
- Sem `data-model.md` (zero schema delta).
