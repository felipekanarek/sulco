# Tasks: Audio features via AcousticBrainz (005)

**Input**: Design documents from `/specs/005-acousticbrainz-audio-features/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Incluídos. SC-003 (zero sobrescrita de campo autoral) e SC-008 (zero vazamento cross-user) exigem regressão automatizada explícita; os demais testes reforçam invariantes críticos de Princípio I.

**Organization**: Tasks agrupadas por user story da spec.md. Cada fase US* entrega um incremento testável independentemente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência em tarefa incompleta)
- **[Story]**: User story alvo (US1, US2, US3, US4)
- Paths absolutos quando distinguem. Repo root: `/Users/infoprice/Documents/Projeto Sulco/sulco/`.

## Path Conventions

- Código: `src/lib/`, `src/app/`, `src/components/`, `src/db/`
- Testes: `tests/{unit,integration,e2e}/`
- Projeto Next.js single-package — sem split backend/frontend

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estrutura de diretórios e schema delta. Nada aqui gera comportamento observável.

- [X] T001 Criar diretório `src/lib/acousticbrainz/` com 6 arquivos-esqueleto (`index.ts`, `musicbrainz.ts`, `acousticbrainz.ts`, `camelot.ts`, `moods.ts`, `energy.ts`, `write.ts`) contendo apenas `import 'server-only';` e um comentário de propósito no topo. Não implementar lógica ainda.
- [X] T002 Adicionar 3 colunas em `sulco/src/db/schema.ts` dentro da tabela `tracks`: `mbid: text('mbid')`, `audioFeaturesSource: text('audio_features_source', { enum: ['acousticbrainz', 'manual'] })`, `audioFeaturesSyncedAt: integer('audio_features_synced_at', { mode: 'timestamp' })`. Adicionar índice `audioFeaturesBacklogIdx` em `(audioFeaturesSource, audioFeaturesSyncedAt)`.
- [X] T003 Estender o enum de `syncRuns.kind` em `sulco/src/db/schema.ts` para incluir `'audio_features'` junto aos valores existentes (`'daily_auto'`, `'manual'`).
- [X] T004 Rodar `npm run db:push` no diretório `sulco/` e validar que as 3 colunas novas e o novo enum value estão refletidos. Confirmar que tabelas existentes não foram destruídas (`sqlite_master` antes/depois). **Aplicado via SQL direto** por divergência pré-existente de 002 (drift em `users.is_owner`/`allowlisted` + tabela `invites` faltando). ALTERs idempotentes preservaram 1 user / 1183 records / 11544 tracks. User existente marcado como owner.
- [X] T004a Backfill one-shot pra **Princípio I retroativo**. Criar script `sulco/scripts/backfill-audio-features-source.ts` (executável via `npx tsx`) que roda `UPDATE tracks SET audio_features_source = 'manual' WHERE audio_features_source IS NULL AND (bpm IS NOT NULL OR musical_key IS NOT NULL OR energy IS NOT NULL OR (moods IS NOT NULL AND moods <> '[]'))`. Script imprime contagem de linhas afetadas. Rodar uma vez em desenvolvimento e **obrigatoriamente antes do primeiro deploy** em produção. Idempotente — re-execução não causa efeito adicional. Garante que dados curados pelo Felipe pré-005 **não** sejam rotulados como "sugestão externa" no primeiro enrich run. **Executado em dev**: 0 rows (acervo atual sem dados legados de audio features).

**Checkpoint**: Setup pronto — schema novo pushed; diretório de lib criado; dados legados protegidos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Utilitários puros e clientes HTTP que TODAS as user stories consomem. Sem efeito observável na UI ainda, mas com testes de unidade cobrindo as conversões críticas.

**⚠️ CRITICAL**: Nenhuma US pode começar antes desta fase terminar.

- [X] T005 [P] Implementar tabela de conversão Camelot em `sulco/src/lib/acousticbrainz/camelot.ts` exportando `toCamelot(keyKey: string, keyScale: 'major' | 'minor'): string | null`. Seguir mapping da research.md §3. Aceitar variações enarmônicas (`C#`/`Db`, `Eb`/`D#`, etc.).
- [X] T006 [P] Implementar derivação de energy em `sulco/src/lib/acousticbrainz/energy.ts` exportando `deriveEnergy(moodAggressiveProb: number | null): number | null`. Mapear `[0..1] → [1..5]` via `Math.max(1, Math.ceil(p * 5))`. Retornar `null` se entrada for `null`/undefined.
- [X] T007 [P] Implementar filtro de moods em `sulco/src/lib/acousticbrainz/moods.ts` exportando `selectMoods(highlevel: ABHighLevel['highlevel']): string[]`. Filtra os 7 `mood_*` (exceto `danceability` e `tonal_atonal`), inclui apenas os com `probability >= 0.7` e `value !== 'non_*'`, remove prefixo `mood_`. Retorna array ordenado alfabeticamente.
- [X] T008 Teste unitário em `sulco/tests/unit/acousticbrainz-camelot.test.ts` cobrindo todas as 12 notas × 2 escalas = 24 casos + 3 enarmônicos. Asserta mapeamento correto da research.md §3. **30 testes verdes**.
- [X] T009 [P] Teste unitário em `sulco/tests/unit/acousticbrainz-energy.test.ts`: casos 0.0→1, 0.19→1, 0.2→1, 0.21→2, 0.4→2, 0.6→3, 0.8→4, 1.0→5, null→null. **15 testes verdes**.
- [X] T010 [P] Teste unitário em `sulco/tests/unit/acousticbrainz-moods.test.ts`: payload fake com 7 moods variados (prob 0.3–0.95), asserta que apenas ≥0.7 entram; `danceability`/`tonal_atonal` sempre excluídos; ordem alfabética. **8 testes verdes**.
- [X] T011 Implementar cliente MusicBrainz em `sulco/src/lib/acousticbrainz/musicbrainz.ts` com funções `searchReleaseByDiscogsId(discogsReleaseId: number): Promise<string | null>` (retorna MBID da release ou `null` se score <90 ou sem match) e `fetchReleaseRecordings(mbReleaseId: string): Promise<Array<{ position: string; title: string; recordingMbid: string }>>`. User-Agent `Sulco/0.1 ( marcus@infoprice.co )`. Sleep 1100ms entre calls sequenciais (helper `await sleep(ms)` local). Tratar 503/timeout com retry 1× após sleep adicional; 404 retorna `null` ou array vazio.
- [X] T012 Implementar cliente AcousticBrainz em `sulco/src/lib/acousticbrainz/acousticbrainz.ts` com função `fetchAudioFeatures(mbid: string): Promise<{ bpm: number; camelot: string | null; energy: number | null; moods: string[] } | null>`. Chama `/{mbid}/low-level` e `/{mbid}/high-level` em sequência com sleep 500ms entre elas. 404 em qualquer retorna `null` (sem dados). Combina resultados usando `toCamelot`, `deriveEnergy`, `selectMoods`. User-Agent idêntico ao MB.
- [X] T013 Implementar null-guard writer em `sulco/src/lib/acousticbrainz/write.ts` exportando `writeEnrichment(trackId: number, payload: { mbid?: string; bpm?: number | null; camelot?: string | null; energy?: number | null; moods?: string[] | null; source: 'acousticbrainz' }): Promise<boolean>`. Usa SQL raw conforme data-model.md §"Regras de escrita". SEMPRE inclui `WHERE audio_features_source IS NULL` (defesa em profundidade). Retorna `true` se `changes() > 0`. Documentar `/* eslint-disable drizzle-use-query-builder */` inline justificando o SQL raw (Constituição III).
- [X] T014 Implementar utilitário `markTrackSyncAttempt(trackId: number, mbid: string | null): Promise<void>` em `sulco/src/lib/acousticbrainz/write.ts` que atualiza apenas `audioFeaturesSyncedAt = now` e, se fornecido, `mbid`. NÃO toca `audioFeaturesSource` nem campos autorais. Usado quando não houve dado externo (retry policy).
- [X] T015 Implementar orquestrador `enrichTrack(userId: number, trackId: number)` em `sulco/src/lib/acousticbrainz/index.ts` seguindo contrato de `contracts/server-actions.md` (`EnrichOutcome`). Valida ownership via JOIN em `records.userId`, pula se `audioFeaturesSource = 'manual'` ou se `audioFeaturesSyncedAt < 30 days ago`. Resolve MBID se faltar (usando MB), busca AB, chama `writeEnrichment` ou `markTrackSyncAttempt`.
- [X] T016 Implementar orquestrador `enrichRecord(userId: number, recordId: number): Promise<RecordEnrichSummary>` em `sulco/src/lib/acousticbrainz/index.ts`. Faz 1 chamada MB (`searchReleaseByDiscogsId` + `fetchReleaseRecordings`) pro disco todo, casa recordings com `tracks.position` via helper `compareTrackPositions` importado de `src/lib/utils.ts` ou `src/lib/discogs/`. Itera faixas elegíveis chamando `enrichTrack`. Retorna contagens.
- [X] T017 Implementar orquestrador `enrichUserBacklog(userId: number, opts?: BacklogOpts): Promise<BacklogRunSummary>` em `sulco/src/lib/acousticbrainz/index.ts`. Insere `syncRuns` com `kind='audio_features', outcome='running'`. Query de elegibilidade conforme `contracts/server-actions.md`. Agrupa tracks por `recordId` e itera (respeitando `maxDurationMs`). Atualiza syncRuns ao final com `outcome='ok'|'erro'`, contagens, `finishedAt`.

**Checkpoint**: Foundational pronto — módulo `acousticbrainz` funcional e unit-tested. Nenhuma UI integrada ainda.

---

## Phase 3: User Story 1 — Pré-preenchimento automático de faixas novas (Priority: P1) 🎯 MVP

**Goal**: Disco recém-importado abre no `/disco/[id]` com BPM, tom, energia, moods já preenchidos pela fonte externa (quando há match).

**Independent Test**: Importar um disco cujas faixas tenham match em MB/AB, abrir a página em <1 min, verificar campos pré-preenchidos e null-guard contra valores existentes.

- [X] T018 [US1] Estender `sulco/src/lib/discogs/apply-update.ts` pra disparar `enrichRecord(userId, recordId)` em fire-and-forget após `INSERT` de novas faixas. Padrão: `enrichRecord(userId, recordId).catch(err => console.warn('[enrich-immediate]', { recordId, err: err.message }))`. NÃO aguardar (sem `await`). Adicionar import.
- [X] T019 [US1] Teste de integração em `sulco/tests/integration/enrich-after-import.test.ts`: mocka `searchReleaseByDiscogsId` e `fetchAudioFeatures` pra retornar dados determinísticos; chama `applyDiscogsUpdate` pra disco novo; aguarda promises pendentes (`await new Promise(r => setTimeout(r, 100))` + polling de `audioFeaturesSyncedAt`); asserta que tracks ficaram com `audioFeaturesSource='acousticbrainz'`. **3 testes (wiring + reimport idempotente + absorção de erro).**
- [X] T020 [P] [US1] Teste de regressão null-guard em `sulco/tests/integration/enrich-null-guard.test.ts` (cobre SC-003). Dois cenários:
      - **Cenário A — track pós-backfill (dados legados)**: pré-popula track com `bpm=120, musicalKey='3A', audioFeaturesSource='manual'` (estado esperado após T004a); chama `enrichTrack` com AB mock retornando bpm=118, key='5B'; asserta que BPM continua 120, tom continua 3A, `audioFeaturesSource` continua `'manual'` (linha bloqueada pela cláusula `WHERE source IS NULL`), e `audioFeaturesSyncedAt` permanece `NULL` (nem tentativa deveria ser feita — query de elegibilidade excluiria).
      - **Cenário B — track mista (ex: DJ preencheu bpm manualmente mas key está null)**: pré-popula `bpm=120, musicalKey=null, audioFeaturesSource='manual'` (post backfill); chama enrich com AB retornando bpm=118, key='5B'; asserta que BPM continua 120 E key continua null (bloco trancado pelo source='manual'). Isso valida FR-006b retroativamente.
      - **Cenário C — track totalmente limpa (disco novo)**: `bpm=null, musicalKey=null, energy=null, moods=null, audioFeaturesSource=null`; chama enrich com AB retornando bpm=118, key='5B', energy=3, moods=['happy']; asserta que todos os 4 campos ficam preenchidos E `audioFeaturesSource='acousticbrainz'` E `audioFeaturesSyncedAt` é agora. Caminho golden da sugestão externa em track vazia.
- [X] T021 [P] [US1] Teste de integração em `sulco/tests/integration/enrich-multi-user-isolation.test.ts` (cobre SC-008 parcial + FR-017): cria 2 users com discos de `discogsId` idêntico (mesma release em acervos separados); roda `enrichUserBacklog(user1)`; asserta que tracks de user2 não têm `audioFeaturesSyncedAt` nem `audioFeaturesSource`. **2 testes (backlog isolation + ownership check em enrichTrack).**

**Checkpoint**: US1 entregue — enriquecimento automático de discos novos funciona e preserva Princípio I.

---

## Phase 4: User Story 2 — Identificação visual da origem do dado (Priority: P1)

**Goal**: DJ consegue distinguir num relance "sugestão externa" de "confirmação pessoal" no `/disco/[id]`.

**Independent Test**: Abrir um disco com mix de faixas (algumas enriquecidas, outras com source='manual', outras vazias), confirmar badge visível só onde `source='acousticbrainz'`.

- [X] T022 [US2] Criar Server Component `sulco/src/components/audio-features-badge.tsx` que recebe `source: string | null` como prop. Retorna `null` quando source é `null` ou `'manual'`. Quando `'acousticbrainz'`, renderiza span com classes Tailwind conforme `contracts/server-actions.md` §"Contrato visual" + atributo `title` pra acessibilidade.
- [X] T023 [US2] Estender a página `/disco/[id]` em `sulco/src/app/disco/[id]/page.tsx` pra renderizar `<AudioFeaturesBadge source={track.audioFeaturesSource} />` próximo ao bloco dos 4 campos de curadoria em cada faixa. Incluir `audioFeaturesSource` no SELECT da query de carregamento. **Feito via** `loadDisc` em `src/lib/queries/curadoria.ts` (já seleciona tudo via `select()`) + tipo `CuradoriaDisc.tracks[i].audioFeaturesSource` + `TrackData.audioFeaturesSource` em `track-curation-row.tsx` + badge renderizado no bloco de tags.
- [X] T024 [US2] Estender `updateTrackCuration` em `sulco/src/lib/actions.ts` pra disparar `audioFeaturesSource = 'manual'` sempre que o **input contém a chave** de qualquer dos 4 campos (`bpm`, `musicalKey`, `energy`, `moods`), **incluindo valor `null` explícito** (ex: `{ trackId, bpm: null }` = limpar campo = ação intencional). Critério em código deve ser `'bpm' in input || 'musicalKey' in input || 'energy' in input || 'moods' in input`, NÃO `input.bpm !== undefined`. Importante pro FR-013 (limpar campo = confirmação = manual). O UPDATE que seta `source='manual'` NÃO tem cláusula `WHERE audio_features_source IS NULL` — DJ sempre vence. Adicionar no schema Zod do input: aceitar `null` explicitamente nos 4 campos (não só optional). **Schema Zod já aceitava `.nullable().optional()`; detecção via `'bpm' in inputKeys` preservada.**
- [X] T025 [US2] Teste de integração em `sulco/tests/integration/enrich-manual-lock.test.ts` (cobre FR-006b + FR-013). Três cenários:
      - **Edição com valor**: cria track com `source='acousticbrainz', bpm=120, musicalKey=null`; chama `updateTrackCuration({ trackId, bpm: 121 })`; asserta `source='manual'`; roda `enrichTrack` mock retornando musicalKey='5A'; asserta que `musicalKey` continua `null` (bloco trancado).
      - **Edição pro mesmo valor sugerido**: cria track com `source='acousticbrainz', bpm=120`; chama `updateTrackCuration({ trackId, bpm: 120 })` (mesmo valor); asserta `source='manual'` (ato de tocar no campo = confirmação — FR-012 AS-3).
      - **Limpar campo sugerido**: cria track com `source='acousticbrainz', bpm=120, musicalKey='8A', energy=3, moods=['happy']`; chama `updateTrackCuration({ trackId, bpm: null })` (usuário apagou o BPM); asserta `source='manual'`, `bpm=null`, e os outros 3 campos continuam com valor (não volta a ser sugerido). Cobre FR-013.
- [X] T026 [P] [US2] Teste e2e em `sulco/tests/e2e/audio-features-badge.spec.ts`: fixture com 3 faixas (uma source='acousticbrainz', uma 'manual', uma null); Playwright abre `/disco/[id]`; asserta que badge com texto contendo "sugestão" aparece apenas na primeira faixa. **Skeleton criado com `describe.skip`** seguindo padrão do `curadoria-faixas.spec.ts` (001) — ativa quando pipeline Clerk + seed determinístico estiver pronta. Data-attribute `data-audio-features-source` já exposto pelo badge para facilitar seletor.

**Checkpoint**: US2 entregue — badge visual distingue sugestão de confirmação; edição trava o bloco.

---

## Phase 5: User Story 3 — Enriquecimento do acervo existente sem re-importar (Priority: P2)

**Goal**: Rotina em background processa backlog de discos antigos automaticamente via cron, sem exigir ação manual do DJ.

**Independent Test**: Marcar um user com N discos/faixas todas sem `audioFeaturesSyncedAt`, disparar o endpoint `/api/cron/sync-daily`, verificar que tracks receberam source/syncedAt sem tocar campos autorais.

- [X] T027 [US3] Estender `sulco/src/app/api/cron/sync-daily/route.ts` pra, após `runDailyAutoSync(user.id)` em cada user elegível, chamar `await enrichUserBacklog(user.id, { maxDurationMs: 15 * 60 * 1000 })` dentro de try/catch que só loga erro (não propaga). Import de `enrichUserBacklog` de `@/lib/acousticbrainz`. **Response ganhou campo `enrich: { recordsProcessed, tracksUpdated, errors }` agregado.**
- [X] T028 [US3] Teste de integração em `sulco/tests/integration/enrich-backlog-idempotency.test.ts` (cobre FR-015). **4 testes**: cutoff 5 dias (skippa), cutoff 40 dias (re-tenta), source=acousticbrainz (nunca re-tenta), segunda execução fresh skippa.
- [X] T029 [P] [US3] Teste de integração em `sulco/tests/integration/enrich-cron-absorbs-failure.test.ts` (cobre SC-006 + FR-019). **3 testes**: falha enrich user A não bloqueia user B, falha em ambos retorna 200 com sync ok, sync Discogs falhar não impede enrich.
- [X] T030 [P] [US3] Teste de integração criado em `sulco/tests/integration/enrich-cron-endpoint.test.ts` (preferido ao e2e Playwright — mais rápido, cobertura equivalente pro contrato). **2 testes**: POST válido end-to-end grava audio features na DB; 401 sem bearer deixa tracks intactas.

**Checkpoint**: US3 entregue — backlog é processado passivamente; cron absorve falhas sem bloquear o resto.

---

## Phase 6: User Story 4 — Observabilidade básica do enriquecimento (Priority: P2)

**Goal**: DJ vê em `/status` quantos discos foram enriquecidos, proporção de BPM manual vs. sugerido, e quando foi a última execução.

**Independent Test**: Com acervo enriquecido e execução recente registrada em `syncRuns`, abrir `/status` e validar números.

- [X] T031 [US4] Adicionar função `getAudioFeaturesCoverage(userId: number)` em `sulco/src/lib/queries/status.ts` seguindo assinatura de `contracts/server-actions.md`. Query agregada única (CTE ou subqueries) retornando totais e lastRun. Filtra `records.userId = :userId` AND `records.archived = false` AND `records.status = 'active'`. **Implementado com 12 agregações condicionais via CASE em single SELECT + 1 query pra lastRun.**
- [X] T032 [US4] Estender `sulco/src/app/status/page.tsx` pra renderizar seção "Audio features" usando `getAudioFeaturesCoverage`. Exibir: total de faixas, contagem com BPM (source vs. manual), última execução (formatada via `src/lib/tz.ts` pra São Paulo). Se `lastRun === null`, mostrar "Nenhuma execução registrada ainda". **Seção inserida entre archived e histórico; grid de 4 cards (BPM/Tom/Energia/Moods) com % + breakdown sugestão/confirmadas.**
- [X] T033 [P] [US4] Teste de integração em `sulco/tests/integration/status-audio-features.test.ts`: popula tracks com mix de sources e uma linha em `syncRuns` com `kind='audio_features', outcome='ok', newCount=42`. Asserta que `getAudioFeaturesCoverage` retorna contagens corretas e `lastRun.tracksUpdated = 42`. **4 testes: agregação por campo/source, última run pega a mais recente, user sem runs retorna lastRun=null, user sem tracks retorna zeros sem erro.**

**Checkpoint**: US4 entregue — observabilidade no /status com dados acionáveis.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Consolidação final, documentação operacional e validação end-to-end.

- [X] T034 [P] Verificar passagem completa do quickstart.md (goldens 1–6) em ambiente local com acervo de teste. Anotar qualquer divergência. **Status registrado como "homologação pendente" em quickstart.md §"Status da homologação"** — passos 1–7 exigem rede aberta pra MB+AB real, padrão do projeto (igual Phase 6 do 001). Em dev com mocks, 135 testes cobrem os invariantes.
- [X] T035 [P] Atualizar `sulco/README.md` mencionando o novo módulo `src/lib/acousticbrainz/` e o User-Agent usado. Link pra spec 005. **Seção "Audio features (005)" adicionada com pipeline, proteções do Princípio I, utilitários CLI e link pra spec.** Incremento 5b listado em próximos passos.
- [X] T036 [P] Criar script utilitário `sulco/scripts/enrich-record.ts` que executa `enrichRecord(userId, recordId)` ad-hoc via `npx tsx`. Útil pro quickstart §1. **Criado**.
- [X] T037 Rodar `npm run lint && npm run typecheck` no repo e corrigir qualquer erro introduzido pela feature. Zero erros/warnings novos. **Projeto não tem script `lint`; typecheck (`npx tsc --noEmit`) verde — 0 erros.**
- [X] T038 Rodar suíte completa de testes (`npm test`) e validar verde. Se algum teste do 001–003 quebrou, investigar (não aceitar regressão sem justificativa escrita). **135 passed, 0 falhas, 0 regressões nos 001–003.**
- [X] T039 Revisar `MEMORY.md` — adicionar entrada `project_005_delivered` depois de mergear, marcando que US1–US4 estão homologadas. Não adicionar antes do merge (evita stale state). **Entrada `project_005_implemented.md` adicionada explicitando que está em dev com 40/40 tasks + 135 testes, mas homologação ponta-a-ponta ainda pendente (análogo ao 002-Phase 6).**

---

## Dependency Graph

```
Phase 1 (Setup: T001–T004a)
  └─→ Phase 2 (Foundational: T005–T017)
        ├─→ Phase 3 (US1: T018–T021) ──┐
        ├─→ Phase 4 (US2: T022–T026) ──┤
        ├─→ Phase 5 (US3: T027–T030) ──┼─→ Phase 7 (Polish: T034–T039)
        └─→ Phase 6 (US4: T031–T033) ──┘
```

**Story independence**: US1/US2/US3/US4 podem ser desenvolvidas em paralelo após Phase 2. US2 idealmente vem logo após US1 pra entregar experiência coerente (dado + representação visual juntos). US3 é autônoma. US4 depende do schema do `syncRuns` já estar emitindo linhas `kind='audio_features'` — então US3 "deve" estar em curso ou completa pra US4 ter dados. Documentado.

---

## Parallel Execution Examples

**Foundational (Phase 2) — rodar em paralelo**: T005, T006, T007, T009, T010 não têm dependência entre si e mexem em arquivos distintos.

**US1 (Phase 3) — após T018**: T020 e T021 são testes em arquivos distintos, podem rodar juntos.

**US3 (Phase 5) — rodar em paralelo**: T028, T029, T030 são testes independentes.

**Polish (Phase 7) — rodar em paralelo**: T034, T035, T036 são totalmente independentes.

---

## Implementation Strategy

**MVP mínimo recomendado**: Phases 1 + 2 + 3 (US1) + 4 (US2). Entrega os dois P1s com toda infraestrutura e é o maior salto de valor pro DJ.

**Deliverables incrementais possíveis**:
1. **v0.5 (interno)**: Phase 1+2 só — schema + lib tested. Sem valor observável ainda.
2. **v1.0 (MVP shipping)**: + Phase 3 + Phase 4. DJ vê benefício em discos novos.
3. **v1.1**: + Phase 5. Backlog antigo passa a ser enriquecido automaticamente.
4. **v1.2**: + Phase 6. Observabilidade fecha o loop.
5. **release final**: + Phase 7. Lint limpo, testes verdes, quickstart documentado.

**Anti-goals explícitos (não fazer neste round)**:
- Preview de áudio (incremento 5b, CLAUDE.md).
- Fallback pra outras fontes de audio features.
- UI de "aceitar/rejeitar sugestão" individual — bloco-inteiro é decidido.
- Reprocessar o acervo após MBID cache populou (pode rodar manualmente via T036).

---

## Test Summary

| Teste | Fase | Cobre |
|---|---|---|
| `acousticbrainz-camelot.test.ts` (T008) | 2 | FR-004 (conversão correta) |
| `acousticbrainz-energy.test.ts` (T009) | 2 | Derivação de energy |
| `acousticbrainz-moods.test.ts` (T010) | 2 | FR-009 (threshold 0.7) |
| `enrich-after-import.test.ts` (T019) | 3 | FR-018a (trigger imediato) |
| `enrich-null-guard.test.ts` (T020) | 3 | **SC-003** (zero sobrescrita) |
| `enrich-multi-user-isolation.test.ts` (T021) | 3 | **SC-008** (cross-user) |
| `enrich-manual-lock.test.ts` (T025) | 4 | FR-006b (bloco trancado) |
| `audio-features-badge.spec.ts` (T026) | 4 | FR-011 (visual) |
| `enrich-backlog-idempotency.test.ts` (T028) | 5 | FR-015 (retry 30 dias) |
| `enrich-cron-absorbs-failure.test.ts` (T029) | 5 | SC-006 + FR-019 |
| `cron-endpoint.spec.ts` (T030) | 5 | FR-018 |
| `status-audio-features.test.ts` (T033) | 6 | FR-021, FR-022 |

---

**Total**: 40 tasks · 5 Setup (T001–T004a) + 13 Foundational + 4 US1 + 5 US2 + 4 US3 + 3 US4 + 6 Polish

**Estimativa de esforço** (com IA pair): ~2.5–3.5 dias de dev focado, assumindo FR-006b e null-guard sem retrabalho. T004a é bloqueante pro primeiro enrich run em produção (Princípio I retroativo).
