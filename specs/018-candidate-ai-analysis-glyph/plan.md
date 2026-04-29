# Implementation Plan: Análise IA + glyph de expandir nos cards de candidato

**Branch**: `018-candidate-ai-analysis-glyph` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/018-candidate-ai-analysis-glyph/spec.md`

## Summary

Hoje o `<CandidateRow>` em `/sets/[id]/montar` (a) não carrega
`tracks.aiAnalysis` apesar do score `rankByCuration` referenciar o
campo, e (b) usa glyph `▸`/`▾` no botão de expandir, que se confunde
com `▶` dos botões de preview de áudio (Inc 008).

**Abordagem**: 2 alterações localizadas em 2 arquivos:

1. **Query**: adicionar `aiAnalysis` ao `select` e ao tipo `Candidate`
   em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts).
   `rankByCuration` já referencia o campo; basta carregá-lo de fato.
2. **Componente**: em [src/components/candidate-row.tsx](../../src/components/candidate-row.tsx):
   (a) renderizar uma seção "Análise" no bloco expandido quando
   `aiAnalysis` for não-vazio, agrupada com os demais facets
   curatoriais (comment/references); (b) trocar `▾`/`▸` por `−`/`+`
   no botão de toggle, preservando todos os atributos ARIA já
   existentes (`aria-expanded`, `aria-controls`, `aria-label`).

Sem schema delta. Sem novas Server Actions. Sem nova rota.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM (existing query), Tailwind CSS v3
**Storage**: SQLite via libsql (Turso em prod). Reusa coluna `tracks.aiAnalysis` (text nullable) já existente desde Inc 13
**Testing**: validação manual via quickstart (alinhado com convenção do projeto)
**Target Platform**: Browser desktop + mobile (≤640px)
**Project Type**: Web application (Next.js monolito com RSC)
**Performance Goals**: zero impacto perceptível — adicionar 1 coluna no SELECT já existente é negligível em payload
**Constraints**: glyphs DEVEM ser ASCII (`+` U+002B, `−` U+2212) para compatibilidade universal de fonte; Princípio V tap target ≥44×44 px em mobile
**Scale/Scope**: limit default `300` candidatos por listagem; cada um pode ter análise de até ~500 chars (soft limit do Inc 13). Payload extra estimado ≤150 KB no pior caso, ainda dentro da margem do First Load JS atual (137 kB já no `/sets/[id]/montar`)

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: feature é puramente leitura de
  campo AUTHOR híbrido (`aiAnalysis`) que já existe e cuja escrita
  permanece exclusiva nas actions do Inc 13. Nenhum write novo.
- **II. Server-First por Padrão — OK**: query é Server Component
  (RSC) — `<CandidateRow>` é client por causa do `useState`
  pré-existente, mas não há mutação nova nem nova lógica de cliente.
  Apenas renderização condicional + troca de literal (`▸` → `+`).
- **III. Schema é a Fonte da Verdade — OK**: zero schema delta.
  `tracks.aiAnalysis` já é tipado em
  [src/db/schema.ts](../../src/db/schema.ts).
- **IV. Preservar em Vez de Destruir — OK**: feature não deleta
  nem modifica dados.
- **V. Mobile-Native por Padrão — OK**: spec inclui FR-010 (tap
  target ≥44×44 px) e SC-004 (mobile 375–640px sem regressão).
  Quickstart inclui cenário mobile. Glyphs `+`/`−` são ASCII
  universais. Nota: tap target atual do botão de expandir é
  `w-11 h-11 md:w-8 md:h-8` (44×44 mobile, 32×32 desktop). Esta
  feature **preserva o status quo** (não regride mobile, não tenta
  upgrar desktop) — o que era aceito em Inc 009 baseline mobile
  permanece aceito. Decisão registrada em research.md.

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/018-candidate-ai-analysis-glyph/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões (escolha de glyph, escopo do tap target, comportamento de empty)
├── contracts/
│   └── ui-contract.md   # Contrato visual/comportamental do <CandidateRow> pós-refactor
├── quickstart.md        # Phase 1 — cenários de validação manual (incl. mobile)
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

Sem `data-model.md`: zero novas entidades; reuso de
`tracks.aiAnalysis` já documentado em features prévias.

### Source Code (repository root)

```text
src/
├── lib/
│   └── queries/
│       └── montar.ts                    # ALTERADO — `Candidate.aiAnalysis: string | null` adicionado ao tipo + ao SELECT do queryCandidates
└── components/
    └── candidate-row.tsx                 # ALTERADO — (a) seção "Análise" condicional no expandido; (b) glyph `+`/`−` no botão de toggle
```

**Structure Decision**: monolito Next.js (já estabelecido). Refator
mínimo, 2 arquivos:
- Query em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts)
  ganha 1 campo no tipo `Candidate` e no `select`.
- Componente em [src/components/candidate-row.tsx](../../src/components/candidate-row.tsx)
  ganha 1 bloco condicional de renderização e 2 trocas de literal de
  glyph. Todo restante (chip layout, ARIA, expand state, preview
  buttons) permanece intacto.

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
