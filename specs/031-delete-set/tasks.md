# Tasks: Excluir set (Inc 30)

**Input**: Design documents from `specs/031-delete-set/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓
**Tests**: validação manual via quickstart.

**Modo de implementação**: simples. Sem schema delta. Sem migration prod. ~30-45min.

## Phase 1: Setup

- [X] T001 Confirmar branch `031-delete-set` ativa + arquivos design já criados.

## Phase 2: Foundational (Server Action core)

- [X] T002 Adicionar Server Action `deleteSet` em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Localizar bloco de Server Actions de set (perto de `createSet`/`updateSet` ~linha 1100+).
  - Schema Zod: `z.object({ setId: z.number().int().positive() })`.
  - Função:
    ```ts
    export async function deleteSet(
      input: z.infer<typeof deleteSetSchema>,
    ): Promise<ActionResult> {
      const user = await requireCurrentUser();
      const parsed = deleteSetSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, error: 'ID inválido.' };
      }
      const result = await db
        .delete(setsTable)
        .where(and(eq(setsTable.id, parsed.data.setId), eq(setsTable.userId, user.id)))
        .returning({ id: setsTable.id });
      if (result.length === 0) {
        return { ok: false, error: 'Set não encontrado.' };
      }
      revalidatePath('/sets');
      return { ok: true };
    }
    ```
  - Confirmar imports já existentes: `setsTable`, `requireCurrentUser`, `db`, `eq`, `and`, `revalidatePath`, `z`. Todos provavelmente já importados (mesmo bloco de `updateSet`).

## Phase 3: User Story 1 — DJ exclui set + US2 cancelamento (P1)

**Goal**: client component com `window.confirm` + `useTransition` + `router.push`.

**Independent test**: cenários 1, 2, 3 do quickstart.

- [X] T003 [US1] Criar [src/components/delete-set-button.tsx](../../src/components/delete-set-button.tsx) (NOVO):
  - `'use client'` no topo.
  - Props: `{ setId: number; setName: string; className?: string }`.
  - Imports: `useTransition` de react, `useRouter` de next/navigation, `deleteSet` Server Action.
  - State: `isPending` via `useTransition`, `error: string | null` via `useState`.
  - Handler:
    ```ts
    function handleDelete() {
      const confirmed = window.confirm(
        `Excluir o set "${setName}"?\n\nAs faixas dele permanecem na coleção.\nEsta operação não pode ser desfeita.`,
      );
      if (!confirmed) return;
      startTransition(async () => {
        const res = await deleteSet({ setId });
        if (res.ok) {
          router.push('/sets');
        } else {
          setError(res.error);
          setTimeout(() => setError(null), 5000);
        }
      });
    }
    ```
  - Visual: botão estilo destrutivo. Mesmo padrão visual do "Editar set" no `/sets/[id]/page.tsx` (font-mono uppercase tracking-wide), mas com cor accent ou ink-soft. Tap target `min-h-[44px]`. Label dinâmica:
    - Default: "Excluir set"
    - Pending: "Excluindo…"
  - Mensagem de erro inline abaixo do botão (com auto-dismiss 5s — mesmo pattern Inc 19 record-status-actions).
  - `disabled={isPending}` no botão.

## Phase 4: User Story 1 — Posicionamento (P1)

- [X] T004 [US1] Adicionar `<DeleteSetButton>` em [src/app/sets/[id]/page.tsx](../../src/app/sets/[id]/page.tsx):
  - Importar `DeleteSetButton` de `@/components/delete-set-button`.
  - No header existente (`<section className="flex flex-col md:grid...">`), adicionar `<DeleteSetButton>` ao lado do `<Link href={\`/sets/${set.id}/montar\`}>` "Editar set".
  - Wrapping em flex gap pra não quebrar layout responsivo:
    ```tsx
    <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
      <Link href={`/sets/${set.id}/montar`} ...>Editar set</Link>
      <DeleteSetButton setId={set.id} setName={set.name} />
    </div>
    ```

- [X] T005 [US1] Adicionar `<DeleteSetButton>` em [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx):
  - Mesmo import.
  - Posicionar após `<EditSetModal ... />` (linhas ~94-102) no mesmo `<div className="flex flex-wrap items-center gap-2 ...">`.

## Phase 5: User Story 3 — Multi-user (P2)

**Goal**: ownership já é coberto pelo `WHERE userId = user.id` em T002. Tarefa apenas valida.

- [X] T006 [US3] Smoke local: testar com 2 users no banco local.
  - Criar set como user A (sqlite).
  - Tentar `deleteSet({ setId: <set-do-A> })` simulando user B (alterar `requireCurrentUser` mock ou rodar via Server Action chamada manualmente em script).
  - Esperado: `{ ok: false, error: 'Set não encontrado.' }`.
  - Alternativa simples (sem 2 users locais): pular este step e verificar via cenário 5 do quickstart pós-deploy.

## Phase 6: Polish

- [X] T007 Build local: `npm run build`. Zero erros TS.

- [X] T008 Smoke local: rodar dev server, criar set, deletar via UI, confirmar redirect + lista atualizada.

- [ ] T009 Commit em branch `031-delete-set` com mensagem `feat(031): excluir set (Inc 30)`. Push branch.

- [ ] T010 Merge `031-delete-set` → `main` com `--no-ff`. Push main.

- [ ] T011 Deploy prod manual:
  ```bash
  vercel --prod --yes
  ```

- [ ] T012 Smoke test pós-deploy: rodar cenários 1, 2, 3, 8 do quickstart.

- [ ] T013 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar `- **031** — Excluir set (Inc 30) · 2026-05-XX · specs/031-delete-set/ · ...`. Remover Inc 30 de "Próximos". Atualizar header. Atualizar CLAUDE.md SPECKIT marker promovendo Inc 30 → "Prior active".

## Dependencies

- T002 (Server Action) ANTES de T003 (component importa `deleteSet`).
- T003 (component) ANTES de T004 + T005 (pages importam).
- T007 (build) depende de T002-T005.
- T008 (smoke local) depende de T007.
- T009-T013 sequenciais.

## Parallelization examples

Tasks [P]:
- T002 [P] — actions.ts
- T003 [P] — delete-set-button.tsx (depende T002)
- T004 [P] — page.tsx (depende T003)
- T005 [P] — montar/page.tsx (depende T003)

## MVP Scope

**MVP = US1 (T002-T005) + Polish (T007-T012)**.

US3 (multi-user) é coberto automaticamente pelo `WHERE userId = ?` em T002.

## Implementation strategy

Sequência ótima:

1. **T001** (instantâneo)
2. **T002** (Server Action, ~10min)
3. **T003** (component, ~15min)
4. **T004 + T005** (posicionamento, ~5min cada = 10min)
5. **T007** (build, 3min)
6. **T008** (smoke local, 5min)
7. **T009-T011** (commit + merge + deploy, ~10min)
8. **T012** (smoke prod, ~5min)
9. **T013** (BACKLOG + CLAUDE.md, ~5min)

**Total estimado: ~60min**.

Reversibilidade: revert do commit. Sets já apagados continuam apagados.
