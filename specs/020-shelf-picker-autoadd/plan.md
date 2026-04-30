# Implementation Plan: Prateleira como select picker (com auto-add)

**Branch**: `020-shelf-picker-autoadd` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/020-shelf-picker-autoadd/spec.md`

## Summary

Hoje em [/disco/[id]](../../src/app/disco/[id]/page.tsx) o campo
"Prateleira" é um `<input type="text">` livre dentro de
[`<RecordControls>`](../../src/components/record-controls.tsx)
(linhas 87-101). Esta feature substitui esse input por um
combobox `<ShelfPicker>` que (a) lista prateleiras já em uso pelo
DJ, (b) filtra por busca incremental, (c) permite criar nova
on-the-fly quando o termo digitado não existe, e (d) permite
limpar (NULL).

**Abordagem**:

1. Helper server-side novo `listUserShelves(userId)` em
   [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts)
   — `SELECT DISTINCT shelfLocation FROM records WHERE userId = ?
   AND shelfLocation IS NOT NULL ORDER BY lower(shelfLocation)`.
2. Carregamento da lista no RSC `[/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx)`,
   passada como prop pra `<RecordControls>` → `<ShelfPicker>`.
3. Novo client component `<ShelfPicker>` que:
   - Em desktop: trigger button + popover absoluto.
   - Em mobile (≤640px): trigger button + bottom sheet via
     `<MobileDrawer side="bottom">` (primitiva existente do Inc 009).
   - Estado interno: `open`, `query` (texto digitado), `optimistic`
     (último valor commitado pra evitar flash de "antigo" enquanto
     RSC revalida).
   - Persiste via `updateRecordAuthorFields` (action existente).
4. `<RecordControls>` substitui o `<input>` da seção "Prateleira"
   por `<ShelfPicker>`. Resto do componente intacto (status, notes).

Sem schema delta. Sem novas Server Actions de escrita.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM (existing query helpers), Tailwind CSS v3, primitiva `<MobileDrawer>` (Inc 009), `useTransition` + `useState` (React)
**Storage**: SQLite via libsql (Turso em prod). Reusa `records.shelfLocation` (text max 50, nullable) já tipado em [src/db/schema.ts](../../src/db/schema.ts)
**Testing**: validação manual via quickstart (alinhado com convenção do projeto)
**Target Platform**: Browser desktop + mobile (≤640px)
**Project Type**: Web application (Next.js monolito com RSC)
**Performance Goals**: filtragem client-side instantânea (≤16ms — 1 frame); save após clique ≤500ms (Server Action + revalidatePath); lista atualizada em ≤1s entre discos diferentes (SC-004)
**Constraints**: tap target ≥44 px mobile (FR-012, Princípio V); 50 chars max (FR-009 — limite do schema); ARIA combobox completo (FR-013)
**Scale/Scope**: Felipe tem ~30 prateleiras hoje; cap teórico de ~200 prateleiras viáveis sem virtualização. Lista distinct é leitura barata (índice padrão por user_id já cobre)

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: feature edita o campo
  AUTHOR `records.shelfLocation` apenas via clique do DJ. Reusa
  `updateRecordAuthorFields` (action existente) que tem ownership
  via `requireCurrentUser`. Sem fonte externa.
- **II. Server-First por Padrão — OK**: a página `/disco/[id]`
  permanece RSC; o picker é client component pelo mínimo
  necessário (estado de aberto/fechado, foco, animação). Lista
  de prateleiras é carregada server-side no RSC e passada por
  prop — sem fetch client.
- **III. Schema é a Fonte da Verdade — OK**: zero schema delta.
  `records.shelfLocation` já é tipado (text max 50, nullable).
- **IV. Preservar em Vez de Destruir — OK**: feature não deleta
  prateleiras nem registros. Mudar shelf é reversível; setar NULL
  preserva o disco e seus dados.
- **V. Mobile-Native por Padrão — OK**: FR-012 (bottom sheet
  fullscreen-friendly + tap targets ≥44 px), SC-003 (validação
  375–640px), edge case mobile na spec. Quickstart MUST incluir
  cenário mobile. Reusa `<MobileDrawer side="bottom">` — pattern
  já validado em Inc 009.

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/020-shelf-picker-autoadd/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões (case-insensitive sort, casing preservado, MobileDrawer reuso, ARIA, save-on-click, popover desktop)
├── contracts/
│   └── ui-contract.md   # Contrato visual + ARIA + estado do <ShelfPicker>
├── quickstart.md        # Phase 1 — cenários manuais (incl. mobile + a11y + lista grande + multi-user)
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

Sem `data-model.md`: zero novas entidades; reuso de
`records.shelfLocation`. Helper `listUserShelves` é projeção,
não entidade.

### Source Code (repository root)

```text
src/
├── app/
│   └── disco/
│       └── [id]/
│           └── page.tsx                          # ALTERADO — carrega `userShelves` via `listUserShelves(user.id)` e passa pro <RecordControls>
├── components/
│   ├── record-controls.tsx                       # ALTERADO — substituir <input type="text"> de Prateleira por <ShelfPicker>; aceita prop `userShelves: string[]`
│   ├── shelf-picker.tsx                          # NOVO — client component; popover desktop + <MobileDrawer side="bottom"> mobile
│   └── mobile-drawer.tsx                         # SEM MUDANÇA — primitiva reusada
└── lib/
    ├── actions.ts                                 # SEM MUDANÇA — `updateRecordAuthorFields` reusado
    └── queries/
        └── collection.ts                          # ALTERADO — adicionar `listUserShelves(userId): Promise<string[]>`
```

**Structure Decision**: monolito Next.js, **3 arquivos
alterados** + **1 arquivo novo**:

- 1 query helper novo (server-only).
- 1 client component novo (`<ShelfPicker>` que importa
  `<MobileDrawer>` existente).
- 1 ajuste em `<RecordControls>` (substituir input por picker
  + aceitar prop nova).
- 1 ajuste em `/disco/[id]/page.tsx` (carregar e passar lista).

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
