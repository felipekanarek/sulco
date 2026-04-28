# Implementation Plan: Editar briefing e dados do set após criação

**Branch**: `016-edit-set-fields` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/016-edit-set-fields/spec.md](./spec.md)

## Summary

Server Action `updateSet` JÁ existe em `src/lib/actions.ts:945`
(partial update via Zod, ownership check, `normalizeDate`,
`revalidatePath` nas 3 rotas). Esta feature entrega APENAS:

1. Componente `<EditSetModal>` client (mesmo padrão do
   `<DeleteAccountModal>` existente): `useState(open)`, modal
   fullscreen com `role="dialog"` quando aberto, form com 4
   campos pré-preenchidos, ESC e clique no overlay fecham.
2. Botão "✏️ Editar set" no header de `/sets/[id]/montar` que
   abre o modal.
3. Submit do form chama `updateSet`, fecha modal em sucesso,
   `router.refresh()` recarrega RSC com valores novos.

Sem schema delta. Sem novas Server Actions. Sem migrations.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15, Drizzle ORM (server), Clerk; **`updateSet` action** existente
**Storage**: SQLite/Turso. **Sem schema delta.**
**Testing**: Verificação manual via `npm run dev` + `npm run build`. Sem suíte automatizada.
**Target Platform**: Web (Vercel + Turso, Node.js 20+)
**Project Type**: single Next.js project (`src/`)
**Performance Goals**: Modal abre em <100ms (estado local). Salvamento ≤500ms p95 (action é simples UPDATE).
**Constraints**:
- Princípio I — sem mudança de comportamento de escrita; reusa `updateSet` que já está conforme.
- Princípio II — Server Action existente, novo componente client justificado por estado local de modal + form.
- Princípio III — sem schema delta.
- Reusa pattern do `<DeleteAccountModal>` (overlay fixed, role=dialog, state local).

**Scale/Scope**:
- 1 componente novo: `<EditSetModal>` (~80-100 linhas)
- Integração no header de `/sets/[id]/montar/page.tsx` (3-4 linhas)
- Zero código de Server Action

## Constitution Check

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | Apenas DJ via UI escreve. `updateSet` (existente) tem ownership check. Nenhum sync externo toca esses campos. |
| **II. Server-First por Padrão** | OK | RSC carrega `set` no `/sets/[id]/montar` page; modal é client justificado (form interativo + estado de open). Submit usa Server Action. |
| **III. Schema é a Fonte da Verdade** | OK | Zero schema delta. |
| **IV. Preservar em Vez de Destruir** | OK | Edição é overwrite voluntário pelo DJ. Cancelar fecha sem persistir. Sem destruição automática. |

**Restrições técnicas**: nenhuma nova lib.

**Veredito**: passa sem violação.

## Project Structure

### Documentation (this feature)

```text
specs/016-edit-set-fields/
├── plan.md
├── spec.md
├── research.md
├── data-model.md (skipped — sem entidades novas)
├── contracts/
│   └── components.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
src/
├── components/
│   └── edit-set-modal.tsx                 # NOVO — client component
└── app/
    └── sets/[id]/montar/
        └── page.tsx                       # +import +chamada do <EditSetModal>
```

**Structure Decision**: 1 componente novo + integração mínima no
page. Pattern espelha `<DeleteAccountModal>` existente — copy
estrutural com adaptações pra form de 4 campos em vez de
confirmação textual.

## Phase 0: Outline & Research

1 questão resolvida em `/speckit.clarify` (modal). Decisões
remanescentes em [research.md](./research.md):

1. Fechar modal ao salvar com sucesso vs deixar DJ fechar
2. Posição do botão "Editar set" no header da página
3. Conversão eventDate UTC ↔ datetime-local input
4. Auto-focus no primeiro campo ao abrir
5. Fechamento via ESC + clique fora
6. Validação client-side: bloquear submit ou só mostrar erro
7. Reset do form ao reabrir modal (descartar mudanças não-salvas)

## Phase 1: Design & Contracts

- **research.md**: 7 decisões de UI/UX.
- **contracts/components.md**: assinatura de `<EditSetModal>`.
- **quickstart.md**: cenários manuais (editar briefing, editar
  vários campos, cancelar, validação, ESC, sem mudanças).
- **CLAUDE.md**: marker SPECKIT atualizado.
- **data-model.md**: omitido — sem entidades novas, decisões já
  documentadas em research.md.

## Complexity Tracking

> Sem violações. Tabela vazia.
