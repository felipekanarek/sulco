# Implementation Plan: Excluir set

**Branch**: `031-delete-set` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/031-delete-set/spec.md`

## Summary

Server Action `deleteSet(setId)` em `actions.ts` faz hard-delete em `sets` com ownership check via `WHERE userId = user.id`. FK cascade existing em `set_tracks.setId` (linha 215 schema) limpa relações automaticamente. Client component `<DeleteSetButton>` em `src/components/delete-set-button.tsx` adiciona botão "Excluir set" com `window.confirm` + `useTransition` + `router.push('/sets')` pós-sucesso. Botão posicionado no header de `/sets/[id]/page.tsx` (visualização) ao lado do "Editar set" existente. Sem schema delta, sem migration prod.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router), Drizzle ORM (libsql), `next/navigation` (`useRouter`, `notFound`).
**Storage**: Turso prod / SQLite local. Schema unchanged.
**Testing**: Validação manual via [quickstart.md](./quickstart.md).
**Target Platform**: Vercel Hobby + browsers modernos.
**Project Type**: web (Next.js App Router single-app).
**Performance Goals**: deleção em ≤500ms percebidos; ≤10 rows lidas no banco.
**Constraints**: zero gasto Vercel Hobby; reversível por revert (delete físico não recuperável via UI).
**Scale/Scope**: ~3 arquivos modificados (actions.ts, sets/[id]/page.tsx, montar/page.tsx) + 1 novo (delete-set-button.tsx).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ set é zona AUTHOR pura (DJ cria + edita + deleta). Sync Discogs nunca toca sets. Cascade FK em set_tracks remove só associação, NÃO toca tracks (curadoria preservada).
- **II — Server-First por Padrão**: ✅ Server Action `deleteSet`. Client component só pra `window.confirm` + `router.push` (operação interativa exige client).
- **III — Schema é a Fonte da Verdade**: ✅ sem schema delta. Reusa cascade FK existing.
- **IV — Preservar (Soft-Delete)**: ⚠️ Hard delete em `sets` é EXCEÇÃO justificada — sets são metadata curatorial criada e descartável pelo DJ; soft-archive como `records.archived` não se aplica (records protegem-se de sync externo, sets não têm sync externo). Tracks/records permanecem 100% intactos. Princípio IV aplica-se a curadoria autoral em records/tracks, não a sets.
- **V — Mobile-Native por Padrão**: ✅ `window.confirm` é fullscreen nativo iOS/Android. Tap target ≥44px (botão usa mesmo padrão `min-h-[44px]` do Editar set existente).

**Resultado**: passa em todos os princípios. Justificativa de hard-delete em IV documentada explicitamente.

## Project Structure

### Documentation (this feature)

```text
specs/031-delete-set/
├── plan.md                       # Este arquivo
├── research.md                   # Phase 0 — decisões + alternativas (low-risk)
├── data-model.md                 # Phase 1 — sem delta, apenas refs a entities existing
├── quickstart.md                 # Phase 1 — validação manual
└── checklists/
    └── requirements.md           # Já criado em /speckit.specify
```

Sem `contracts/` — não há helpers públicos novos, apenas 1 Server Action standalone.

### Source Code (repository root)

```text
src/
├── lib/
│   └── actions.ts                       # MOD: adicionar Server Action `deleteSet(setId)` perto das outras de set (createSet/updateSet linha ~1100).
├── components/
│   └── delete-set-button.tsx            # NOVO: client component com window.confirm + useTransition + router.push.
└── app/sets/
    ├── [id]/page.tsx                    # MOD: adicionar `<DeleteSetButton>` no header ao lado de "Editar set".
    └── [id]/montar/page.tsx             # MOD: adicionar `<DeleteSetButton>` no header ao lado de `<EditSetModal>` (paridade).
```

**Sem helpers internos novos** — Server Action é trivial (1 SELECT ownership + 1 DELETE).

**Sem migration prod** — cascade FK existing em `set_tracks.setId` (verificado: linha 215 de schema.ts).

**Structure Decision**: single-app Next.js. Mudanças confinadas a 4 arquivos.

## Complexity Tracking

> Sem violações constitucionais a justificar. Hard-delete em sets é decisão de produto (metadata vs. curadoria), explícita.

**Riscos identificados**:

1. **Race com sessão do DJ em outra aba**: DJ apaga set em aba A; aba B com `/sets/[id]/montar` aberto tenta `addTrackToSet`. Server Action falha por FK violation ou ownership fail. UX aceitável (rara). Mitigação: `revalidatePath('/sets')` força re-fetch.

2. **Acesso por URL após delete**: `loadSet(userId, setId)` retorna `null` → `notFound()` (404 padrão Next.js). Comportamento correto.

3. **DJ apaga set por engano**: hard-delete sem recuperação UI. Mitigação: `window.confirm` claramente avisa "operação não pode ser desfeita". Recuperação via backup do banco (manual, escala atual aceita).

4. **Multi-user attack**: DJ B contorna UI e dispara `deleteSet(setIdDoA)`. Server Action filtra `WHERE userId = user.id`; DELETE retorna 0 rows affected → resposta de erro. Set de A intacto.

5. **Botão presente em 2 telas** (`/sets/[id]` e `/sets/[id]/montar`): potencial de confusão UX. Mitigação: mesma instância de `<DeleteSetButton>` reutilizada com props idênticos. Comportamento idêntico em ambos.

6. **Reversibilidade**: revert do commit pelo git. Sets físicamente apagados continuam apagados — backup do banco se necessário (escala 1-2 sets de teste, custo aceito).
