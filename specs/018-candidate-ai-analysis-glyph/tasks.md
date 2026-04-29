# Tasks: Análise IA + glyph de expandir nos cards de candidato

**Input**: Design documents from `specs/018-candidate-ai-analysis-glyph/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: Não solicitados na spec — validação via quickstart manual.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: mapeia task para user story (US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: ler arquivos-chave antes de tocar código. Sem schema
delta, sem migration, sem dependência nova.

- [X] T001 Verify baseline: read [src/lib/queries/montar.ts:19-46](../../src/lib/queries/montar.ts) and confirm shape do tipo `Candidate` + linha 127 onde `aiAnalysis` é referenciado em `rankByCuration` (incoerência atual a corrigir)
- [X] T002 [P] Verify baseline: read [src/components/candidate-row.tsx:240-340](../../src/components/candidate-row.tsx) — bloco expandido (linhas 244-309) e botão de toggle (linhas 322-331) onde a mudança de glyph ocorre
- [X] T003 [P] Verify baseline: read [src/components/track-curation-row.tsx](../../src/components/track-curation-row.tsx) bloco "Análise" como referência visual/léxica do título "Análise" usado em `/disco/[id]` (consistência cross-rota)

**Checkpoint**: shape do código entendido; pronto pra editar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: nenhuma. Reusa coluna `tracks.aiAnalysis` já tipada.
Sem helpers compartilhados a criar.

- (none — no schema delta, no shared infra changes)

**Checkpoint**: foundation pronta por padrão.

---

## Phase 3: User Story 1 — Ler análise IA enquanto monta set (Priority: P1) 🎯 MVP

**Goal**: DJ no `/sets/[id]/montar`, ao expandir um card de candidato
com `tracks.ai_analysis` preenchido, vê uma seção "Análise" read-only
abaixo de comentário/referências. Resolve a incoerência atual em que
o score `rankByCuration` considera o campo mas a query nem o seleciona.

**Independent Test**: cenários 1, 2, 3 do
[quickstart.md](./quickstart.md) — análise visível em faixa preenchida,
ausente em faixa vazia, read-only sempre.

### Implementation for User Story 1

- [X] T004 [US1] Estender tipo `Candidate` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts) (linhas 19-46): adicionar `aiAnalysis: string | null` entre `references: string | null` e `isBomb: boolean`
- [X] T005 [US1] Adicionar `aiAnalysis: tracks.aiAnalysis` ao `select` do `queryCandidates` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts) (linhas 137-162), entre os campos `references` e `isBomb`. Sem mudanças em `where`, `orderBy`, `limit`, ou `rankByCuration`
- [X] T006 [US1] Renderizar bloco "Análise" no expandido do `<CandidateRow>` em [src/components/candidate-row.tsx](../../src/components/candidate-row.tsx) (col-1 do grid, abaixo do bloco `comment` que termina por volta da linha 280): condicional `candidate.aiAnalysis !== null && candidate.aiAnalysis.trim().length > 0`, com markup conforme contracts/ui-contract.md (label-tech ink-mute no título "Análise" + serif italic 13px text-ink whitespace-pre-line no corpo, sem aspas, mb-3 entre blocos). Read-only — sem textarea, sem botão de editar, sem botão "✨ Analisar com IA"

**Checkpoint**: User Story 1 funcional. Quickstart cenários 1, 2, 3
validam.

---

## Phase 4: User Story 2 — Glyph de expandir não confunde com play (Priority: P1)

**Goal**: trocar `▾`/`▸` por `−`/`+` no botão de toggle do
`<CandidateRow>` para eliminar ambiguidade visual com `▶` dos botões
de preview de áudio do Inc 008.

**Independent Test**: cenários 4, 5, 6 do
[quickstart.md](./quickstart.md) — glyph ASCII universal, tap target
mobile preservado, ARIA preservado.

### Implementation for User Story 2

- [X] T007 [US2] Trocar literal de glyph no botão de toggle do `<CandidateRow>` em [src/components/candidate-row.tsx](../../src/components/candidate-row.tsx) (linha ~330): substituir `{expanded ? '▾' : '▸'}` por `{expanded ? '−' : '+'}`. Usar `−` (U+2212, minus sign tipográfico — NÃO `-` U+002D hífen). Manter classes Tailwind (`w-11 h-11 md:w-8 md:h-8 ...`), `aria-expanded`, `aria-controls`, `aria-label` exatamente como hoje

**Checkpoint**: ambas user stories funcionais. Cenários 4, 5, 6 validam.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: type-check + quickstart completo + entry de release no
BACKLOG. Validação cobre mobile (Princípio V), a11y (FR-009), análise
longa, e edge case de sugestão IA do Inc 014/015.

- [X] T008 Run TypeScript + lint: `npm run build` (build serve como type-check). Confirmar zero erros relacionados a `aiAnalysis` em `Candidate` ou em `<CandidateRow>`
- [ ] T009 [P] Execute quickstart cenários 1, 2, 3 (US1) em desktop: análise visível com texto preservado, omitida quando vazia, read-only confirmado
- [ ] T010 [P] Execute quickstart cenário 4 (US2 desktop): glyph `+`/`−` visível, sem ambiguidade com `▶` Deezer; clicar expand não toca áudio
- [ ] T011 [P] Execute quickstart cenário 5 (mobile / Princípio V) viewport 375×667 + 390×844: tap target medido ≥44×44 via DevTools, sem scroll horizontal, glyph e bloco "Análise" legíveis
- [ ] T012 [P] Execute quickstart cenário 6 (a11y / FR-009): `aria-expanded` toggla `false`↔`true`, `aria-label` toggla "Expandir detalhes"↔"Recolher detalhes", VoiceOver/NVDA anuncia corretamente
- [ ] T013 Execute quickstart cenários 7 e 8 (edge cases): análise >1500 chars renderiza integral sem truncamento; faixa de sugestão IA do Inc 014/015 mostra justificativa (header) **e** análise (expandido) sem conflito visual
- [ ] T014 Validação cruzada: navegar entre `/sets/[id]/montar` e `/disco/[id]` da mesma faixa; confirmar que o texto de "Análise" é idêntico nas duas rotas (mesma fonte de verdade `tracks.ai_analysis`)
- [X] T015 Add release entry to [BACKLOG.md](../../BACKLOG.md): mover Inc 17 de "🟢 Próximos" para "Releases" como `018-candidate-ai-analysis-glyph` com one-line summary; atualizar header "Última atualização"

**Checkpoint**: feature pronta para commit/merge/deploy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 sequential (read primeiro pra confirmar
  posição da incoerência); T002 e T003 paralelos (read-only,
  arquivos distintos).
- **Foundational (Phase 2)**: vazia.
- **US1 (Phase 3)**: T004 sequential primeiro (define tipo); T005
  depende de T004 (consome tipo); T006 depende de T005 (renderiza
  campo carregado pela query).
- **US2 (Phase 4)**: T007 independente — pode rodar em paralelo
  com US1 se preciso, mas como toca o mesmo arquivo
  (`candidate-row.tsx`) que T006, melhor sequenciar pra evitar
  merge conflict — T007 após T006.
- **Polish (Phase 5)**: T008 sequencial após implementação completa;
  T009-T012 paralelos (cenários manuais não-conflitantes); T013/T014
  sequenciais após T009-T012; T015 final.

### User Story Dependencies

- **US1 (P1)**: independente. Entrega valor sozinha — DJ ganha
  acesso à análise IA mesmo se o glyph continuasse `▸`.
- **US2 (P1)**: independente. Entrega valor sozinha — glyph claro
  mesmo sem análise IA visível. **Mesma prioridade P1** porque
  ambos resolvem fricções funcionais distintas.

### Within Each User Story

- US1: T004 (tipo) → T005 (query) → T006 (UI).
- US2: T007 isolado.

### Parallel Opportunities

- T002, T003 paralelos no Setup.
- T009, T010, T011, T012 paralelos no Polish (cenários manuais
  distintos, não-conflitantes).

---

## Parallel Example: Polish phase

```bash
# Run quickstart scenarios in parallel:
Task: "Cenário 1, 2, 3 (US1) em desktop"
Task: "Cenário 4 (US2) em desktop"
Task: "Cenário 5 (mobile 375×667 + 390×844)"
Task: "Cenário 6 (a11y com VoiceOver)"
```

---

## Implementation Strategy

### MVP First (US1 entregue isolada)

Possível mas não recomendado — US1 e US2 mexem em arquivos
sobrepostos (`candidate-row.tsx`). Faz mais sentido entregar
ambas juntas (esforço total ~30-45 min).

Sequência linear esperada (single dev — Felipe):
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 →
T009 → T010 → T011 → T012 → T013 → T014 → T015.

### Incremental Delivery

1. Phase 1+2 (Setup): leitura de arquivos.
2. Phase 3 (US1): tipo + query + UI bloco. Type-check intermediário
   opcional (`npm run build` antes de T007).
3. Phase 4 (US2): troca de glyph.
4. Phase 5 (Polish): build + quickstart + BACKLOG + commit final.

---

## Notes

- Tests **não solicitados**. Validação via quickstart manual.
- Princípio V (Mobile-Native) cumprido pelo design: glyphs ASCII
  universais; tap target mantém status quo Inc 009 (44×44 mobile,
  32×32 desktop intencionalmente preservado — Decisão 5 do research).
- Princípio I respeitado: feature é leitura visual de campo AUTHOR
  híbrido. Sem novo write.
- Sem schema delta; sem `data-model.md`; sem novas Server Actions.
- `rankByCuration` permanece intacto (Decisão 6 do research).
- Commit recomendado: 1 único commit no fim da Phase 4 (refator
  pequeno em 2 arquivos).
