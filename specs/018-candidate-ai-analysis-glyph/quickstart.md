# Quickstart — Inc 17: Análise IA + glyph de expandir nos candidatos

**Feature**: 018-candidate-ai-analysis-glyph
**Audience**: Felipe (validação manual pós-implementação)

Pré-requisitos:
- App rodando localmente (`npm run dev`) ou em prod.
- Pelo menos 1 set existente com candidatos elegíveis
  (`/sets/[id]/montar` carrega).
- Pelo menos 2 faixas no catálogo: 1 com `tracks.ai_analysis`
  preenchido, 1 sem.

---

## Setup do estado

Identificar 2 faixas elegíveis (selected + record active):

```sql
-- preencher análise em 1 faixa específica
UPDATE tracks
SET ai_analysis = 'Faixa de groove sambafunky com base orquestral.
Bom para abertura de set diurno; conversa com Floating Points,
Khruangbin. Energia 3, sustenta sem cansar.'
WHERE id = <TRACK_ID_COM_ANALISE>;

-- garantir que outra faixa NÃO tem análise
UPDATE tracks
SET ai_analysis = NULL
WHERE id = <TRACK_ID_SEM_ANALISE>;
```

(Substituir `<TRACK_ID_*>` por IDs de faixas que aparecem como
candidatas no set escolhido.)

---

## Cenário 1 — Análise IA visível no expandido (US1, FR-002, FR-005)

**Passos**:
1. Abrir `/sets/[id]/montar` em desktop.
2. Localizar a faixa com análise preenchida na lista de candidatos.
3. Clicar no botão de expandir do card (`+`).
4. Verificar bloco expandido.

**Esperado**:
- Card expande.
- Na coluna 1, abaixo de "Referências" e "Comentário" (se
  houver), aparece bloco **"Análise"** com o texto:
  > "Faixa de groove sambafunky com base orquestral.\n
  > Bom para abertura de set diurno; conversa com Floating Points,\n
  > Khruangbin. Energia 3, sustenta sem cansar."
- Quebras de linha preservadas (parágrafos visualmente separados).
- Tipografia: serif italic 13px, ink-soft.
- **Sem aspas** ao redor do texto.
- Botão de toggle agora mostra `−`.

---

## Cenário 2 — Análise vazia → seção omitida (US1, FR-003)

**Passos**:
1. Localizar card da faixa SEM análise.
2. Expandir.

**Esperado**:
- Bloco "Análise" **NÃO existe no DOM** (verificar via DevTools:
  `document.querySelector('p:has(+ p) ... contendo "Análise"')`
  retorna apenas a do outro card).
- Sem placeholder, sem mensagem "análise vazia", sem CTA.
- Demais blocos (referências, comentário, localização, link
  "→ abrir curadoria") aparecem normalmente.

---

## Cenário 3 — Read-only no /montar (US1, FR-004)

**Passos**:
1. Card com análise expandido.
2. Tentar interagir com o texto da análise.

**Esperado**:
- Texto é selecionável (cursor de texto), mas não editável.
- Sem `<textarea>` no DOM dentro do bloco "Análise".
- Sem botão "Editar" próximo ao bloco.
- Sem botão "✨ Analisar com IA" — análise existente não é
  re-gerável daqui.
- Para editar: clicar no link `→ abrir curadoria` (que já existe
  no expandido) leva pra `/disco/[id]` onde a edição fica.

---

## Cenário 4 — Glyph não confunde com play (US2, FR-007/FR-008)

**Passos**:
1. Card colapsado.
2. Inspecionar visualmente o botão de expandir.
3. Comparar com botão "▶ Deezer" do mesmo card (Inc 008).

**Esperado**:
- Botão de expandir mostra `+`.
- Botão Deezer mostra `▶ Deezer` (play triangle inalterado).
- **Zero ambiguidade visual** — o `+` não é um triângulo nem
  derivado.
- Clicar `+`: card expande, glyph muda pra `−`. Nenhum áudio
  começa a tocar.
- Clicar `−`: card colapsa, glyph volta pra `+`.

---

## Cenário 5 — Mobile / Princípio V (US2, FR-010, SC-004)

**Passos**:
1. DevTools device toolbar: 375×667 (iPhone SE).
2. Abrir `/sets/[id]/montar` com candidatos.
3. Inspecionar o botão de toggle do expand.
4. Medir tap target (Computed → height/width).
5. Tocar/clicar o botão.
6. Expandir um card com análise preenchida.

**Esperado**:
- Botão `+` visível, `min` 44×44 px (`w-11 h-11`).
- Tap target mensurado: 44×44 mínimo.
- Card expande sem scroll horizontal na rota.
- Bloco "Análise" renderiza com texto legível, fonte serif italic
  preservada, quebras de linha respeitadas.
- Repetir em 390×844 (iPhone 14): mesmo comportamento.

---

## Cenário 6 — Acessibilidade (US2 acceptance #4, FR-009)

**Passos**:
1. Card colapsado, focar o botão de expandir via Tab.
2. Inspecionar atributos ARIA via DevTools.
3. Pressionar Enter ou Space.
4. Re-inspecionar.

**Esperado**:
- Estado colapsado:
  - `aria-expanded="false"`
  - `aria-controls="<id-do-bloco-detalhes>"`
  - `aria-label="Expandir detalhes"`
- Após Enter/Space: card expande.
- Estado expandido:
  - `aria-expanded="true"`
  - `aria-label="Recolher detalhes"`
- Leitor de tela (VoiceOver/NVDA) anuncia: "Expandir detalhes,
  botão" → após click → "Recolher detalhes, botão, expandido".

---

## Cenário 7 — Análise muito longa (Edge Case)

**Setup**:
```sql
UPDATE tracks
SET ai_analysis = '<texto colado de >1500 caracteres>'
WHERE id = <TRACK_ID>;
```

**Passos**:
1. Expandir card daquela faixa.

**Esperado**:
- Texto exibido **integralmente**, sem truncamento.
- Sem CSS de "ver mais" ou ellipsis.
- Card cresce verticalmente conforme necessário.
- Em mobile: scroll vertical natural absorve; sem scroll horizontal.

---

## Cenário 8 — Faixa que é sugestão IA do Inc 014 (Edge Case)

**Setup**: gerar sugestões IA via "✨ Sugerir com IA" no /montar
(Inc 014/015), pegar uma faixa que veio na sugestão **e** tem
`ai_analysis` preenchido.

**Passos**:
1. Card de sugestão IA visível com badge accent + justificativa.
2. Expandir.

**Esperado**:
- Justificativa da sugestão IA continua visível **acima** do
  expandido (no header do card, como hoje em Inc 015).
- No expandido, bloco "Análise" também aparece com
  `tracks.ai_analysis` integral.
- São conteúdos distintos:
  - Justificativa = "por que ela cabe NESTE set" (gerada em
    runtime pelo `suggestSetTracks`).
  - Análise = diagnóstico curatorial geral da faixa (persistido
    em `tracks.ai_analysis`).
- Visualmente distinguíveis: justificativa em italic accent
  (header), análise em italic ink-soft (expandido).

---

## Validação cruzada — paridade com /disco/[id]

**Passos**:
1. Anotar texto exato da análise visto no card de candidato.
2. Clicar `→ abrir curadoria` no expandido.
3. Em `/disco/[id]`, achar a mesma faixa via `<TrackCurationRow>`.
4. Comparar texto do bloco "Análise".

**Esperado**:
- Texto idêntico nos dois lugares (mesma fonte de verdade —
  `tracks.ai_analysis`).

---

## Encerramento

Cobertura mínima: cenários 1 + 2 + 4 + 5 (mobile) verificam o
caminho fundador. Cenários 3, 6, 7, 8 cobrem edge cases.

Após validação, marcar feature como pronta para commit / merge /
deploy.
