---
description: "Task list — Fix Bug 13 (Banner de import com acknowledge)"
---

# Tasks: Fix Bug 13 — Banner de import com acknowledge

**Input**: Design documents from `/specs/010-fix-import-banner-acknowledge/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Não há suíte automatizada no projeto. Validação via cenários manuais
do `quickstart.md` + `npm run build` (TypeScript + lint).

**Organization**: Tasks agrupadas por user story (P1 banner-running, P1
banner-ack, P2 banner-erro). MVP = US1 + US2 (P1 ambos).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 = some pós-acknowledge, US2 = running não-fechável,
  US3 = erro fechável

## Path Conventions

Single project Next.js: `src/db/`, `src/lib/`, `src/components/`, `src/app/`
no repo root. Paths absolutos em todas as tasks.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nada novo — projeto já está inicializado.

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve retornar
  `010-fix-import-banner-acknowledge`. Se não, abortar e re-executar
  `/speckit.specify`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema delta + atualização do retorno de `getImportProgress`.
Todos os 3 user stories dependem destes 2 pontos.

**⚠️ CRITICAL**: nenhum trabalho em user stories pode começar antes do checkpoint.

- [X] T002 Adicionar coluna `importAcknowledgedAt` em `users` no schema
  Drizzle: editar `src/db/schema.ts` para incluir `importAcknowledgedAt:
  integer('import_acknowledged_at', { mode: 'timestamp' })` no objeto
  de colunas de `sqliteTable('users', { ... })`. Posicionar logo após
  `lastStatusVisitAt` (manter zona SYS agrupada). Não adicionar index.

- [X] T003 Aplicar schema no DB local: rodar `npm run db:push` e verificar
  via `sqlite3 sulco.db ".schema users"` que a coluna
  `import_acknowledged_at` foi criada como `INTEGER` nullable.

- [X] T004 Atualizar tipo `ImportProgress` e a função `getImportProgress`
  em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Adicionar `runStartedAt: Date | null` e `lastAck: Date | null` ao
    type `ImportProgress` (linhas ~177-183).
  - No `select` da query `latest` (linha ~192-202), incluir
    `startedAt: syncRuns.startedAt`.
  - Estender o select de `requireCurrentUser` (ou fazer 1 select extra
    curtinho na função) para obter `users.importAcknowledgedAt` do user
    corrente. Preferir reaproveitar `requireCurrentUser` se ele já
    devolver o user completo; senão adicionar query mínima:
    `db.select({ ack: users.importAcknowledgedAt }).from(users).where(eq(users.id, user.id)).limit(1)`.
  - Em todos os `return` da função (idle, needsResume, terminal final),
    adicionar `runStartedAt: latest[0]?.startedAt ?? null` e
    `lastAck: <valor lido>` (ou `null` no caso `latest.length === 0`).
  - Não alterar comportamento de `running`, `outcome`, `x`, `y`,
    `errorMessage` (compat).

**Checkpoint**: schema aplicado + retorno de `getImportProgress` carrega os 2
campos novos. User stories podem começar em paralelo.

---

## Phase 3: User Story 1 — Banner some após acknowledge (Priority: P1) 🎯 MVP

**Goal**: Em estado terminal `outcome='ok'` com último ack anterior ao
`runStartedAt` do run corrente, o banner aparece com botão "× fechar"; clicar
persiste o timestamp e oculta o banner.

**Independent Test**: cenário 1 do [quickstart.md](./quickstart.md): forçar
`syncRuns.outcome='ok'` + `users.import_acknowledged_at=NULL` → ver banner +
botão; clicar → banner some; reload → banner permanece oculto.

- [X] T005 [US1] Criar Server Action `acknowledgeImportProgress` em
  [src/lib/actions.ts](../../src/lib/actions.ts), seguindo o contrato
  em [contracts/server-actions.md](./contracts/server-actions.md):
  - Diretiva `'use server'` já está no topo do arquivo.
  - `requireCurrentUser` → `db.update(users).set({ importAcknowledgedAt: new Date() }).where(eq(users.id, user.id))` →
    `revalidatePath('/')` → `return { ok: true }`.
  - Sem Zod (zero input). Sem early returns extras.
  - Posicionar logo após o bloco de `getImportProgress` para coesão.

- [X] T006 [US1] Refatorar [src/components/import-progress.tsx](../../src/components/import-progress.tsx)
  para consumir `runStartedAt`/`lastAck` e decidir visibilidade:
  - Importar `useTransition` de React.
  - Importar `acknowledgeImportProgress` de `@/lib/actions`.
  - No início do componente (após o `useState(initial)`), computar:
    `const isAcked = state.lastAck !== null && state.runStartedAt !== null && state.lastAck >= state.runStartedAt;`
  - Adicionar early return: se `!state.running && isAcked` → `return null`.
  - Manter o early return existente para zero-state
    (`outcome === 'idle' && state.x === 0`).
  - Em estado terminal não-acked (`outcome === 'ok'`/`'erro'`/`'parcial'`/`'rate_limited'`
    com `!state.running`), renderizar botão "× fechar" no canto superior
    direito do `<Card>` (incluir nas variantes `tone='ok'`, `tone='warn'`).
  - Botão chama `handleAck` via `useTransition`; após `res.ok`,
    chamar `router.refresh()`. Botão fica `disabled` durante `pending`.
  - Tap target ≥44×44px (Tailwind `min-w-[44px] min-h-[44px]`).
  - `aria-label="Fechar banner de import"`.

- [X] T007 [US1] Ajustar o `<Card>` interno para suportar layout com botão
  fechar: usar `relative` no `<section>` e absolute-positioning do botão
  no top-right (`absolute top-3 right-3`). Garantir que o conteúdo do
  card tenha padding-right suficiente para não colidir com o botão em
  mobile.

**Checkpoint**: US1 entregue isoladamente. Cenário 1 + cenário 5
(zero-state) do quickstart passam.

---

## Phase 4: User Story 2 — Running não-fechável (Priority: P1)

**Goal**: Durante `outcome='running'` (ou estado derivado de retomada), o
banner aparece sem botão "× fechar" — DJ não pode ocultá-lo por engano.

**Independent Test**: cenário 2 do quickstart: forçar `syncRuns.outcome='running'`
→ acessar `/` → confirmar 0 ocorrências do botão fechar via `Cmd+F`.

**Note**: este comportamento é garantido por construção pela lógica do T006
(`!state.running` é gate do botão), mas validamos explicitamente como
proteção contra regressão.

- [X] T008 [US2] Validar que o botão "× fechar" só aparece quando
  `!state.running` no [src/components/import-progress.tsx](../../src/components/import-progress.tsx).
  Smoke check: forçar `syncRun running` no DB local e confirmar via
  DevTools que o botão não está no DOM (não apenas hidden via CSS —
  literalmente não renderizado).

- [X] T009 [US2] Confirmar que a transição `running → ok` durante o
  polling de 3s resulta em re-render que adiciona o botão sem reload
  manual: forçar transition manual no DB
  (`UPDATE sync_runs SET outcome='ok', finished_at=unixepoch() WHERE id=<X>`)
  e observar o banner mudar de eyebrow + ganhar botão fechar dentro do
  próximo poll.

**Checkpoint**: US2 entregue. Cenários 2 + transição running→terminal
do quickstart passam.

---

## Phase 5: User Story 3 — Banner com erro também é fechável (Priority: P2)

**Goal**: Estado terminal não-`ok` (`erro`, `parcial`, `rate_limited` sem
retomada) também ganha botão fechar e respeita `lastAck`.

**Independent Test**: cenário 4 do quickstart: forçar
`syncRuns.outcome='erro'` com `errorMessage` legítimo → ver banner amarelo
com botão fechar; clicar → some; reload mantém oculto.

**Note**: T006 já cobre todos os outcomes terminais (não filtra apenas
`ok`). Este phase apenas valida o comportamento expandido + ajusta
estilo do botão na variante `warn` se necessário.

- [X] T010 [US3] Validar visualmente que o botão "× fechar" no `<Card tone="warn">`
  (variante de erro) tem contraste e tamanho adequados. Ajustar
  classes Tailwind se o botão ficar invisível sobre o fundo amarelo.

- [X] T011 [US3] Confirmar que outcomes `parcial`/`rate_limited` SEM
  retomada pendente (rare path: snapshot existe E `x >= y`) também
  exibem botão fechar. Se `needsResume === true`, o estado vira
  `running` derivado e cai em US2.

**Checkpoint**: US3 entregue. Cenários 4 + edge cases de erro do quickstart
passam.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validação final, smoke checks e cleanup.

- [X] T012 Rodar `npm run build` no root e confirmar zero erros novos de
  TypeScript / lint. Se aparecer warning sobre `Date | null` em
  comparação, ajustar para `lastAck.getTime() >= runStartedAt.getTime()`
  (defensive — Drizzle hidrata como `Date`, mas garantir conversão).

- [X] T013 [P] Executar todos os 6 cenários do
  [quickstart.md](./quickstart.md) manualmente em `npm run dev`,
  marcando OK em cada um. Anotar quaisquer regressões em
  `BACKLOG.md > Bugs > Abertos`.

- [X] T014 [P] Verificar o `<ImportPoller>` global em
  [src/components/import-poller.tsx](../../src/components/import-poller.tsx)
  ainda funciona (não foi alterado, mas confirmar que o tipo
  `ImportProgress` expandido não quebra a chamada `await getImportProgress()`
  que ele faz). Browser console em rota não-`/` não deve mostrar
  nenhum erro novo.

- [X] T015 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Bug 13** de `## Bugs > Abertos` para `## Bugs > Histórico`
    com referência ao commit (após merge).
  - Adicionar entrada em `## Releases`:
    `- **010** — Fix Bug 13 (banner de import com acknowledge) · 2026-04-27 · specs/010-fix-import-banner-acknowledge/ · banner some após reconhecimento; running não-fechável; multi-user isolation`.
  - Atualizar campo `**Última atualização**: 2026-04-27`.

- [X] T016 Commit final via `/speckit-git-commit` com referência à spec:
  mensagem no padrão `fix(010): banner de import com acknowledge`.

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → (T008, T009 paralelos)
→ (T010, T011 paralelos) → T012 → (T013, T014 paralelos) → T015 → T016

**Critical bottleneck**: T002 → T003 → T004 são sequenciais e bloqueiam
todos os user stories.

**Parallel windows**:
- T013 + T014 (validação manual + check do poller global): 2 arquivos
  diferentes, sem dependência.
- T008 + T009 (validação US2): podem ser feitas em uma única sessão de
  dev server, mas são checks independentes.
- T010 + T011 (validação US3): idem.

**Não paralelizáveis**:
- T005, T006, T007 tocam o mesmo fluxo (action → componente → estilo do
  card); melhor sequencial para evitar merge mental.

---

## Implementation Strategy

### MVP (mínimo viável)

**Phases 1 + 2 + 3** (T001 a T007) entregam o core do bug fix:
banner some após acknowledge. Apenas isso já fecha o bug reportado.

US2 (T008/T009) é proteção contra regressão; US3 (T010/T011) cobre
edge cases raros de outcome ≠ `ok`. Ambos são triviais sobre o trabalho
do US1 — sem motivo prático para shippar separado.

### Incremental delivery

Sequência sugerida em uma única sessão (~1h total):

1. **Setup + Foundational** (~15 min): T001-T004.
2. **US1 implementation** (~25 min): T005-T007.
3. **US2 + US3 validation** (~10 min): T008-T011.
4. **Polish** (~10 min): T012-T016.

Sem necessidade de stash incremental — o branch é dedicado ao Bug 13.

---

## Format Validation

- [x] Todas as tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T016
- [x] `[P]` em tasks paralelizáveis (T013, T014)
- [x] `[US1]`/`[US2]`/`[US3]` em tasks de user story (T005-T011)
- [x] Sem labels em Setup (T001), Foundational (T002-T004), Polish
  (T012-T016)
- [x] Caminhos de arquivo relativos ao repo root em todas as tasks que
  tocam código
