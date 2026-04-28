# Implementation Plan: Fix Bug 13 — Banner de import com acknowledge

**Branch**: `010-fix-import-banner-acknowledge` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/010-fix-import-banner-acknowledge/spec.md](./spec.md)

## Summary

Bug visual: o `<ImportProgressCard>` na home permanece visível mesmo quando o
import já terminou e foi visto. Solução: schema delta aditivo de 1 coluna em
`users` (`import_acknowledged_at`), `getImportProgress` passa a expor o
`startedAt` do último run e o `lastAck` do user, e o componente decide:
**(a) running** → renderiza sem botão fechar; **(b) terminal não-acknowledged**
→ renderiza com botão "× fechar"; **(c) terminal acknowledged** → não
renderiza. Server Action nova `acknowledgeImportProgress` seta o timestamp
e `revalidatePath('/')`.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15 (RSC + Server Actions), Drizzle ORM, `@libsql/client`, Zod, Clerk, Tailwind v3
**Storage**: SQLite via `@libsql/client` (esquema em `src/db/schema.ts`)
**Testing**: Verificação manual via `npm run dev` (não há suíte automatizada no projeto). `npm run build` para tipo + lint.
**Target Platform**: Web (Vercel Hobby, Node.js 20+)
**Project Type**: Web monolito Next.js — single project (`src/`)
**Performance Goals**: zero impacto no tempo de carga da home; `getImportProgress` já é chamado, soma 1 coluna lida
**Constraints**: respeitar Princípio I (acknowledge é AUTHOR-adjacente, mas timestamp é zona SYS — não é dado curatorial); Server Action ≤60s (trivial aqui)
**Scale/Scope**: 1 schema delta, 1 Server Action nova, refatorar 1 componente client (`import-progress.tsx`), ajuste mínimo em `page.tsx` (passar `lastAck`/`runStartedAt` no `initial`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | `import_acknowledged_at` é metadado de UI/SYS, não campo curatorial. Nenhuma fonte externa escreve nele (só o próprio DJ via clique). Não toca nenhum campo AUTHOR. |
| **II. Server-First por Padrão** | OK | `acknowledgeImportProgress` é Server Action em `src/lib/actions.ts`, validada com Zod, `revalidatePath('/')` no fim. O `<ImportProgressCard>` já era client (necessário pelo polling de 3s); apenas ganha um handler `onClick`. |
| **III. Schema é a Fonte da Verdade** | OK | Coluna nova em `src/db/schema.ts`. `npm run db:push` aplica antes de qualquer consumo. Tipos derivados via `$inferSelect` — sem drift. |
| **IV. Preservar em Vez de Destruir** | OK | Acknowledge nunca apaga `syncRuns` nem altera dados de import. É um marcador "visto" idempotente (não destrutivo). |

**Restrições técnicas**: nenhum desvio. Sem libs novas. Sem Redux/Zustand (usamos `revalidatePath` + RSC re-render). Sem shadcn (botão custom Tailwind seguindo tokens existentes).

**Veredito**: gate passa sem violação. Sem Complexity Tracking necessário.

## Project Structure

### Documentation (this feature)

```text
specs/010-fix-import-banner-acknowledge/
├── plan.md              # Este arquivo
├── spec.md              # Spec de feature (já criada)
├── research.md          # Decisões técnicas (Phase 0)
├── data-model.md        # Schema delta (Phase 1)
├── contracts/
│   └── server-actions.md   # Contratos das Server Actions tocadas
├── quickstart.md        # Como validar manualmente (Phase 1)
└── tasks.md             # Phase 2 (gerado por /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                  # +1 coluna em users (importAcknowledgedAt)
├── lib/
│   └── actions.ts                 # ImportProgress: +runStartedAt, +lastAck
│                                  # +acknowledgeImportProgress (Server Action nova)
├── components/
│   └── import-progress.tsx        # Lógica de visibilidade + botão "× fechar"
└── app/
    └── page.tsx                   # Sem mudança estrutural (já passa progress)
```

**Structure Decision**: single Next.js project. Mantém layout atual de `src/`
(actions concentradas em `src/lib/actions.ts`, componentes client em
`src/components/`, schema em `src/db/schema.ts`). Nenhum módulo novo.

## Phase 0: Outline & Research

Sem `[NEEDS CLARIFICATION]` na spec — a única decisão técnica relevante
estava entre granularidades de acknowledge (por-run vs único timestamp).
Resolvida em [research.md](./research.md).

## Phase 1: Design & Contracts

- **data-model.md**: schema delta da coluna nova, sem entidades novas.
- **contracts/server-actions.md**: contrato de `getImportProgress`
  (campos novos no retorno) e `acknowledgeImportProgress` (input/output).
- **quickstart.md**: passos manuais para validar os 3 cenários (running,
  terminal não-ack, terminal ack).
- **CLAUDE.md**: marker SPECKIT atualizado para apontar para este plano.

## Complexity Tracking

> Sem violações de constituição. Tabela vazia.
