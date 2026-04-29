# UI Contract — `<CandidateRow>` pós-Inc 17

**Feature**: 018-candidate-ai-analysis-glyph
**Component**: [src/components/candidate-row.tsx](../../../src/components/candidate-row.tsx)
**Consumed by**: [/sets/[id]/montar](../../../src/app/sets/[id]/montar/page.tsx) (via [src/components/montar-candidates.tsx](../../../src/components/montar-candidates.tsx))

---

## Tipo `Candidate` (extensão)

Em [src/lib/queries/montar.ts](../../../src/lib/queries/montar.ts):

```typescript
export type Candidate = {
  // ... campos existentes ...
  aiAnalysis: string | null;  // NOVO — Inc 17
};
```

Adicionado entre `references: string | null` e `isBomb: boolean`
(ordenação semântica: campos curatoriais textuais juntos).

## Query `queryCandidates` (extensão)

Adicionar 1 campo no `select`:

```typescript
.select({
  // ... campos existentes ...
  references: tracks.references,
  aiAnalysis: tracks.aiAnalysis,   // NOVO
  isBomb: tracks.isBomb,
  // ... demais campos ...
})
```

Sem mudança em `where`, `orderBy`, `limit`, ou no algoritmo
`rankByCuration` (que já referencia
[`tracks.aiAnalysis`](../../../src/lib/queries/montar.ts#L127)).

---

## Bloco "Análise" no expandido

### Contrato visual

Quando `candidate.aiAnalysis` for **não-vazio** (string com pelo
menos 1 char não-whitespace), o expandido renderiza:

```jsx
<div>
  <p className="label-tech text-ink-mute mb-0.5">Análise</p>
  <p className="font-serif italic text-[13px] text-ink whitespace-pre-line">
    {candidate.aiAnalysis}
  </p>
</div>
```

- Título: `label-tech text-ink-mute` (exatamente como
  "Comentário"/"Referências").
- Corpo: `font-serif italic text-[13px] text-ink
  whitespace-pre-line` (preserva quebras de linha; **sem aspas**
  ao redor do texto, diferenciando da voz humana de comment).
- Posicionado dentro da **coluna 1** do grid 2-col do expandido,
  **abaixo** do bloco "Comentário" (ordem: chips overflow → Referências
  → Comentário → Análise).
- `mb-3` separando do bloco anterior (mesmo padrão dos demais).

### Contrato condicional

```typescript
const hasAnalysis = candidate.aiAnalysis !== null
  && candidate.aiAnalysis.trim().length > 0;
```

`hasAnalysis === false` ⇒ NADA é renderizado (sem título, sem
placeholder, sem CTA). Bloco simplesmente não existe no DOM.

### Contrato semântico

Read-only. NÃO renderizar:
- `<textarea>` ou `<input>`
- Botão "Editar"
- Botão "✨ Analisar com IA" ou similar

Edição/geração permanece exclusiva em
[`/disco/[id]`](../../../src/components/track-curation-row.tsx).

---

## Botão de toggle (expand/collapse)

### Contrato visual

Localização atual:
[src/components/candidate-row.tsx:322-331](../../../src/components/candidate-row.tsx#L322).

```jsx
<button
  type="button"
  onClick={() => setExpanded((e) => !e)}
  aria-expanded={expanded}
  aria-controls={detailsId}
  aria-label={expanded ? 'Recolher detalhes' : 'Expandir detalhes'}
  className="w-11 h-11 md:w-8 md:h-8 rounded-sm border border-line hover:border-ink active:border-ink text-ink-soft hover:text-ink font-mono text-[14px] transition-colors"
>
  {expanded ? '−' : '+'}   {/* Inc 17: era '▾' / '▸' */}
</button>
```

**Mudança ÚNICA**: trocar literal de glyph dentro do `<button>`.

### Glyphs específicos

- Colapsado: `+` (U+002B, plus sign).
- Expandido: `−` (U+2212, minus sign — minus tipográfico, **não**
  hífen-minus `-` U+002D).

### Contrato preservado (NÃO mudar)

- Classes Tailwind: idênticas (44×44 mobile, 32×32 desktop).
- ARIA: `aria-expanded`, `aria-controls`, `aria-label` mantidos
  exatamente como hoje.
- Comportamento de click/keyboard: nenhum delta (botão já é
  acessível por teclado via padrão `<button>`).
- `font-mono text-[14px]` mantém tipografia mono — peso visual
  do `+`/`−` fica equilibrado com o resto da label-tech do card.

---

## Side effects (todos pré-existentes — sem mudança)

- Click do toggle alterna `expanded` (estado local `useState`).
- Não dispara Server Actions.
- Não toca preview de áudio (Inc 008 — botões separados).
- Não dispara revalidate path.

---

## Não-objetivos (explicitamente fora do escopo)

- **NÃO** ajustar tap target desktop pra 44×44 (status quo
  preservado — Decisão 5 do research).
- **NÃO** mexer em outros componentes que renderem candidatos no
  futuro (este componente é único hoje).
- **NÃO** criar componente novo ou helper compartilhado
  pra "render análise" — o bloco é simples o bastante; abstração
  prematura.
- **NÃO** modificar [`<TrackCurationRow>`](../../../src/components/track-curation-row.tsx)
  em `/disco/[id]` (esse já tem o bloco "Análise" próprio com
  edição).
- **NÃO** mudar ordering ou filtering da listagem de candidatos.
