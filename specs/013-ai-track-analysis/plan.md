# Implementation Plan: Análise da faixa via IA

**Branch**: `013-ai-track-analysis` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/013-ai-track-analysis/spec.md](./spec.md)

## Summary

Schema delta de 1 coluna em `tracks` (`ai_analysis` text nullable) +
2 Server Actions novas (`analyzeTrackWithAI`, `updateTrackAiAnalysis`)
+ refator do componente client `<TrackCurationRow>` pra adicionar o
bloco "Análise" sempre visível (placeholder quando vazio, textarea
editável quando preenchido) + botão "✨ Analisar com IA" dentro do
bloco. Reusa `enrichTrackComment(userId, prompt)` do Inc 14 sem
mudança. Ownership check via `requireCurrentUser` + JOIN
`records.user_id`. Build do prompt segue padrão multi-linha
(L1=metadados Discogs, L2=audio features quando presentes,
L3=instrução).

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15, Drizzle ORM, `@libsql/client`, Zod, Clerk; **adapter de IA** já entregue pelo Inc 14 (`src/lib/ai/`).
**Storage**: SQLite (dev) / Turso (prod). Schema delta = 1 coluna `tracks.ai_analysis` (text nullable).
**Testing**: Verificação manual via `npm run dev` + `npm run build`. Sem suíte automatizada.
**Target Platform**: Web (Vercel + Turso, Node.js 20+)
**Project Type**: single Next.js project (`src/`)
**Performance Goals**: Geração ≤10s típico (alinha com SC-001 do Inc 14, FR-012 daqui). Auto-save-on-blur do textarea ≤200ms p95 (mesmo pattern do `comment` existente).
**Constraints**:
- Princípio I — `ai_analysis` é AUTHOR híbrido; IA escreve via clique do DJ; sem fonte externa automática. DJ pode editar livremente.
- Princípio II — Server Actions com Zod; componente client já existe (`TrackCurationRow`).
- Princípio III — schema delta em `src/db/schema.ts`, aplicado via sqlite3/Turso CLI.
- Reusa `enrichTrackComment` do Inc 14 (zero código novo de adapter).

**Scale/Scope**: 1 schema delta, 2 Server Actions novas, 1 refator do `<TrackCurationRow>` (adiciona bloco "Análise" + botão), atualização da query que monta `TrackData` em `/disco/[id]/page.tsx`.

## Constitution Check

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | `tracks.ai_analysis` é AUTHOR híbrido. IA escreve apenas mediante clique explícito do DJ (intencional). DJ pode editar livremente como `comment`. NÃO é escrito por sync de Discogs nem por outra fonte externa. Adicionar este campo à lista AUTHOR de tracks na constituição (governance). |
| **II. Server-First por Padrão** | OK | 2 Server Actions novas em `src/lib/actions.ts` (`analyzeTrackWithAI`, `updateTrackAiAnalysis`), validadas com Zod. Componente cliente já existe (`<TrackCurationRow>`); apenas estende seu UI. `revalidatePath('/disco/[id]')` no fim das actions. |
| **III. Schema é a Fonte da Verdade** | OK | Coluna nova em `src/db/schema.ts` (`tracks.aiAnalysis`). Aplicar via sqlite3 local + Turso CLI prod (workaround do drizzle-kit interativo, mesmo padrão Inc 010/012). |
| **IV. Preservar em Vez de Destruir** | OK | "Re-gerar com confirmação" preserva análise anterior se DJ cancelar (FR-004). Edição manual sobrescreve voluntariamente. Apagar via `NULL` é ação explícita (FR-006). |

**Restrições técnicas**: nenhuma nova lib. Reusa adapter pattern do Inc 14.

**Veredito**: passa sem violação.

## Project Structure

### Documentation (this feature)

```text
specs/013-ai-track-analysis/
├── plan.md                              # Este arquivo
├── spec.md                              # Spec (já clarificada)
├── research.md                          # Decisões técnicas (Phase 0)
├── data-model.md                        # Schema delta + entidade
├── contracts/
│   └── server-actions.md                # 2 actions novas
├── quickstart.md                        # Validação manual
└── tasks.md                             # Phase 2 (gerado por /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                        # +1 coluna tracks.aiAnalysis
├── lib/
│   ├── actions.ts                       # +analyzeTrackWithAI, +updateTrackAiAnalysis
│   ├── ai/
│   │   └── (sem mudança — reusa enrichTrackComment do Inc 14)
│   └── prompts/
│       └── track-analysis.ts            # builder do prompt multi-linha
├── components/
│   └── track-curation-row.tsx           # +bloco "Análise" + botão "✨ Analisar com IA"
└── app/
    └── disco/[id]/
        └── page.tsx                     # query inclui aiAnalysis no TrackData
```

**Structure Decision**: arquivo novo `src/lib/prompts/track-analysis.ts`
isola a montagem do prompt (testável, fácil de iterar). Inc 1
(briefing com IA) provavelmente terá `src/lib/prompts/set-briefing.ts`
seguindo o mesmo pattern. Sem novos diretórios estruturais —
encaixa no esquema `src/lib/`.

## Phase 0: Outline & Research

3 questões resolvidas em `/speckit.clarify`. Decisões técnicas
remanescentes resolvidas em [research.md](./research.md):

1. Posição visual do bloco "Análise" no card (relativo a "Sua nota")
2. Estratégia de auto-save-on-blur pra `aiAnalysis` (reuso vs ação dedicada)
3. Constraints da query em `/disco/[id]/page.tsx` (incluir `aiAnalysis` no select existente)
4. Lista AUTHOR de `tracks` na constituição — adicionar `aiAnalysis`

## Phase 1: Design & Contracts

- **data-model.md**: schema delta + entidade derivada `TrackData` estendida.
- **contracts/server-actions.md**: 2 actions + helper de prompt builder.
- **quickstart.md**: cenários manuais (gerar primeira vez, re-gerar com confirmação, editar manual, apagar texto, multi-user).
- **CLAUDE.md**: marker SPECKIT atualizado + entrada em "AUTHOR fields de tracks" no histórico.

## Complexity Tracking

> Sem violações. Tabela vazia.
