# Implementation Plan: Recompute incremental + dedups remanescentes em /disco/[id]

**Branch**: `025-incremental-recompute` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-incremental-recompute/spec.md`

## Summary

Substituir `recomputeFacets()` síncrono em todos os Server Actions de write por **delta updates direcionados** em `user_facets`, baseados estritamente no que mudou. Edições em campos não materializados (BPM, key, energy, comment, rating, fineGenre, references, isBomb, aiAnalysis, notes) **NÃO disparam recompute**. Edições em campos materializados (status, selected, moods/contexts, shelfLocation) disparam **operações cirúrgicas** (1 UPDATE counter, ou recompute parcial daquela faceta). Sync/import em massa continuam usando recompute completo. Drift residual corrigido por chamada de `recomputeFacets` completo no cron diário existente. Dois adicionais: (B) `aiProvider`/`aiModel` entram no objeto `CurrentUser` cached pra eliminar query duplicada em `/disco/[id]`; (D) auditar `revalidatePath` para remover paths obsoletos.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC, Server Actions), Drizzle ORM (libsql dialect), React 19 (`cache()`)
**Storage**: Turso (libsql) prod; SQLite local dev; tabelas `users`, `records`, `tracks`, `user_facets`, `sync_runs` — **sem mudança de schema nesta feature**
**Testing**: Validação manual via [quickstart.md](./quickstart.md); medição via `[DB]` instrumentation em logs Vercel; cron drift-detection log em prod
**Target Platform**: Vercel Hobby (Lambda nodejs24.x, region gru1/iad1), browsers modernos
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: ≤5 queries/edição típica (vs ~16 hoje); ≤1.000 rows lidas em curadoria de 1 disco com 30 edições (vs ~2M); ≤200ms server action sem latência de recompute
**Constraints**: zero gasto (Vercel Hobby), zero schema delta, reversível por revert, drift residual ≤24h tolerado
**Scale/Scope**: ~10 Server Actions tocadas; ~5 helpers novos em user-facets.ts; refatoração cirúrgica sem reorganização

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ delta updates escrevem apenas em `user_facets` (zona SYS, não AUTHOR). Campos AUTHOR (status, shelfLocation, notes, selected, bpm, etc.) continuam sendo atualizados exclusivamente pelas Server Actions existentes. Sync Discogs continua não tocando AUTHOR.
- **II — Server-First por Padrão**: ✅ tudo continua como Server Actions + RSC. Sem novos client components, sem API routes adicionais. `aiProvider`/`aiModel` em CurrentUser é apenas extensão do RSC pattern.
- **III — Schema é a Fonte da Verdade**: ✅ zero schema delta. Sem migration. `users` e `user_facets` continuam definidos em [src/db/schema.ts](../../src/db/schema.ts).
- **IV — Preservar (Soft-Delete)**: ✅ `recomputeFacets` completo permanece como fallback (não é deletado, apenas deixa de ser chamado em caminho crítico). Drift detectado pelo cron é corrigido **silenciosamente** — nenhum dado é perdido. Tabelas-fonte (records/tracks) seguem sendo a verdade última.
- **V — Mobile-Native por Padrão**: ✅ ganho direto: Server Actions retornam mais rápido = UX mobile melhor (DJ na rua editando faixa em 4G sente menos latência). Tap targets/responsive intactos.

**Resultado**: passa em todos os princípios. Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/025-incremental-recompute/
├── plan.md                                # Este arquivo
├── research.md                            # Phase 0 — decisões + alternativas
├── data-model.md                          # Phase 1 — N/A (zero entities novos)
├── quickstart.md                          # Phase 1 — validação manual
├── contracts/
│   └── facets-delta-helper.md             # Phase 1 — assinaturas dos novos helpers de delta
└── checklists/
    └── requirements.md                    # Já criado em /speckit.specify
```

### Source Code (repository root)

Mudanças confinadas a estes arquivos:

```text
src/
├── lib/
│   ├── auth.ts                            # MOD (Frente B): aiProvider + aiModel em CurrentUser
│   ├── queries/
│   │   └── user-facets.ts                 # MOD: novos helpers `applyRecordStatusDelta`,
│   │                                      #      `applyTrackSelectedDelta`,
│   │                                      #      `recomputeShelvesOnly`,
│   │                                      #      `recomputeVocabularyOnly(kind)`,
│   │                                      #      e função wrapper `applyDeltaForWrite(scope)`
│   ├── actions.ts                         # MOD: substituir `recomputeFacets(user.id)` por
│   │                                      #      delta apropriado em ~7 callsites
│   │                                      #      (`updateRecordStatus`, `updateTrackCuration`,
│   │                                      #      `updateRecordAuthorFields`,
│   │                                      #      `acknowledgeArchivedRecord`,
│   │                                      #      `acknowledgeAllArchived`).
│   │                                      #      Auditar `revalidatePath` (Frente D).
│   │                                      #      Remover query separada de `getUserAIConfigStatus`
│   │                                      #      onde aplicável (Frente B).
│   └── discogs/
│       ├── sync.ts                        # SEM MUDANÇA: continua chamando `recomputeFacets` completo
│       └── import.ts                      # SEM MUDANÇA: idem
└── app/
    ├── api/cron/sync-daily/route.ts       # MOD: adicionar chamada `recomputeFacets(userId)` pra
    │                                      #      cada user no fim do cron (drift correction).
    │                                      #      killZombieSyncRuns (Inc 26) já está aqui.
    └── disco/[id]/page.tsx                # MOD: derivar AI config status de requireCurrentUser
                                            #      (eliminar consulta separada).
```

**Helpers novos em `user-facets.ts`** (assinaturas detalhadas em [contracts/facets-delta-helper.md](./contracts/facets-delta-helper.md)):

- `applyRecordStatusDelta(userId, prev, next, archivedFlag)` — atualiza counters records_active/unrated/discarded; respeita transições válidas; pula no-op (prev===next).
- `applyTrackSelectedDelta(userId, delta: -1|+1)` — atualiza tracksSelectedTotal.
- `recomputeShelvesOnly(userId)` — SELECT DISTINCT shelf_location + UPDATE shelves_json.
- `recomputeVocabularyOnly(userId, kind: 'moods'|'contexts')` — agg JOIN tracks + UPDATE corresponding json column.
- `applyArchiveDelta(userId, delta: { records: -1, byStatus })` — quando record é archivado, decrementa o counter do status anterior. Usado em archiveRecord (Discogs sync removeu o disco). **Não usado nesta feature** se sync continua usando recompute completo.

**Frente B (auth.ts)**:

- Estender tipo `CurrentUser` com `aiProvider: 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'qwen' | null` e `aiModel: string | null`.
- Atualizar `toCurrentUser` mapper.
- `getUserAIConfigStatus` em `actions.ts` (e callers em pages/components) passa a derivar de `requireCurrentUser()` quando o caller já tem a instância. Versões standalone (que já fazem auth interno) podem manter para back-compat.
- **NÃO incluir** `aiApiKeyEncrypted` no objeto cached. Funções como `enrichTrackComment` continuam fazendo SELECT separado para chave (princípio menor exposição).

**Frente D (revalidatePath audit)**:

- Auditar todos os `revalidatePath('...')` em [src/lib/actions.ts](../../src/lib/actions.ts) e [src/lib/discogs/](../../src/lib/discogs/).
- Verificar se algum aponta para rota que não existe mais (`/curadoria` foi deletada no Inc 26).
- Remover paths obsoletos.
- **Não introduzir** `revalidateTag` salvo se ganho claro — adicional de complexidade não justifica nesta feature.

**Structure Decision**: single-app Next.js App Router. Mudanças confinadas a `src/lib/` (90% do trabalho) + ajustes pontuais em `src/app/`. Sem reorganização de diretórios.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados**:
- **Drift entre delta e estado real**: mitigação via cron diário (FR-009/010, SC-006). Aceito por design.
- **Edge case "no-op edit"**: mitigado por checar `result.length` ou `rowsAffected` antes de aplicar delta (FR-007).
- **Edge case "vocabulário com último termo"**: tratado pela natureza idempotente do `recomputeVocabularyOnly` (recomputa do zero a lista de termos atuais — termos sem ocorrência somem naturalmente).
- **Race condition em deltas concorrentes**: SQLite/libsql serializa transações via WAL. UPDATE com expressão `tracks_selected_total = tracks_selected_total ± 1` é atomic em SQL. Aceito sem mecanismo extra.
- **Falha no recompute parcial pós-write principal**: try/catch defensivo em torno do delta — write principal já foi committado, delta failure só causa drift transitório (cron resolve). Mesma estratégia do `recomputeFacets` atual.
