# Implementation Plan: Faixas ricas na tela "Montar set"

**Branch**: `003-faixas-ricas-montar` | **Date**: 2026-04-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/003-faixas-ricas-montar/spec.md`

## Summary

Enriquecer o card de candidato em `/sets/[id]/montar` pra expor todos
os campos autorais já persistidos (rating, Bomba, fineGenre, moods,
contexts, comment, references, shelfLocation, notes do disco),
com toggle compacto/expandido por linha. Zero mudança de schema,
zero dependência nova — puramente UI + ampliação de SELECT no query
que já traz 6 dos 9 campos necessários (falta `references` e
`notes`).

Três pilares:

1. **CandidateCard refatorado** — substitui/estende o `candidate-row.tsx`
   atual. Mantém Server-renderizável até o limite do possível; apenas
   o toggle `expanded` e a chamada `addTrackToSet` são client.
2. **Chips distinguíveis moods vs contexts** — reusa tokens do
   `chip-picker`, com cores/bordas diferentes. Compacto trunca em
   4 + `+N mais`; expandido mostra tudo em wrap.
3. **"Já na bag" visualmente marcado** — card permanece visível com
   borda/check; estado compact/expanded preservado durante a sessão.
   Remove-from-bag inline (botão `×` ou equivalente).

Esforço estimado: 1-2 dias. UI-heavy, sem risco arquitetural.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router + RSC), Drizzle ORM,
Tailwind v3. Nenhuma dependência nova.
**Storage**: Turso/libsql (sem mudança de schema)
**Testing**: Vitest integration (listMontarCandidates retorna campos
novos); Playwright e2e opcional pra toggle compact/expand
**Target Platform**: Vercel Hobby + Turso; browser desktop (mobile
não é foco, consistente com 001/002)
**Project Type**: Web application monolítica (Next.js App Router)
**Performance Goals**: render do card compacto igual ao atual
(±10%); toggle expand/collapse ≤100ms (client-side pure, sem fetch);
query aumenta ~3 colunas por linha (poucos bytes adicionais)
**Constraints**: Princípio I intocável (só leitura dos campos
autorais); pt-BR hard-coded; sem localStorage/cookie de estado
de expansão (reset no reload)
**Scale/Scope**: 500+ candidatos caso-limite; default ~50-100 por
sessão de montagem

## Constitution Check

Referência: `.specify/memory/constitution.md` v1.0.0.

| Princípio | Como o plano se alinha |
|-----------|------------------------|
| **I. Soberania dos Dados do DJ** (NON-NEGOTIABLE) | FR-014 + FR-016: campos autorais são APENAS lidos nesta tela. Zero writes, zero edição inline. Link "→ curadoria" leva ao `/disco/[id]` pra editar. |
| **II. Server-First por Padrão** | CandidateCard: parte Server Component (dados + layout estático), parte Client Component (apenas estado `expanded` + handler `add`/`remove` que já existia). Sem novas API routes. |
| **III. Schema é a Fonte da Verdade** | Zero mudança em `src/db/schema.ts`. Todos os campos já existem e já são persistidos. Apenas expande SELECT no query. |
| **IV. Preservar em Vez de Destruir** | N/A (feature UI-only, sem sync externo). |

**Gate**: ✅ sem violações; segue para Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/003-faixas-ricas-montar/
├── plan.md              # este arquivo
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (mínimo — sem mudança de schema)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── candidate-card.md
├── checklists/
│   └── requirements.md  # criado por /speckit.specify
└── tasks.md             # Phase 2 — criado por /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   └── sets/[id]/montar/
│       └── page.tsx             # MODIFICADO — passa campos novos pro card
├── components/
│   ├── candidate-row.tsx        # REFATORADO in-place — novos modos + chips
│   │                             # (mantém nome pra não quebrar imports;
│   │                             # extrai sub-componente cliente pro toggle)
│   └── chip.tsx                 # NOVO (opcional) — tokens unificados de
│                                 # chip pra moods/contexts, reusa de chip-picker
└── lib/
    └── queries/
        └── montar.ts            # MODIFICADO — expande SELECT e tipo Candidate
                                 # com references (track) + notes (record)
```

**Structure Decision**: monolítico Next.js App Router, herdado do
001/002. Sem separação front/back. Mudança cirúrgica em 2-3 arquivos:
a tela de montar set, o componente de card, e o query de candidatos.

## Complexity Tracking

Sem violações. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
