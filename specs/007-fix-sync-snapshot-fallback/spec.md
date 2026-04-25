# Feature Specification: Fix Bug 11 — sync chama fetchRelease redundante

**Feature Branch**: `007-fix-sync-snapshot-fallback`
**Created**: 2026-04-25 (escopo redefinido após investigação)
**Status**: Draft
**Input**: `runIncrementalSync` chama `fetchRelease()` pra TODOS os 100
discos da 1ª página da coleção Discogs, mesmo aqueles que já existem
em `records` (não são novos). 100 req × Discogs rate limit ~1 req/s
= ~100s → estoura Vercel Lambda 60s → run morre como zombie. Acervo
nunca consegue rodar sync incremental, nem manual nem cron diário.

**Diagnóstico inicial errado**: pensava-se que era falta de snapshot
anterior pra primeira execução manual. Investigação mostrou que o
problema persiste mesmo com snapshot — o gargalo é `fetchRelease`
chamado redundantemente em discos já-existentes.

## User Scenarios & Testing

### User Story 1 — Primeiro sync manual num acervo já importado (Priority: P1)

DJ completou `initial_import` em algum momento (acervo populado em
`records`). Hoje ou semanas depois, ele clica "Sincronizar agora"
em `/sync` pela primeira vez. Ele esperava: discos novos do Discogs
entrarem, discos removidos do Discogs ficarem archived. O que acontece
HOJE: sync trava 60s+ e morre como zombie sem detectar nada.

**Why this priority**: bug bloqueia sync manual e cron diário. Acervo
fica fora de sync com Discogs até alguém intervir manualmente. Felipe
tem 7 discos drift atualmente (5 removidos + 2 novos no Discogs).

**Independent Test**: rodar sync manual num user que tem `initial_import`
ok no histórico mas zero `manual`/`daily_auto` ok. Esperado: sync
completa em <15s, novos detectados, removidos archived corretamente.

**Acceptance Scenarios**:

1. **Given** user com `initial_import` ok mas zero `manual`/`daily_auto` ok,
   **When** clica "Sincronizar agora", **Then** sync completa em <15s
   com `outcome='ok'` (não morre como zombie).
2. **Given** mesmo user com 5 discos removidos no Discogs (não na
   1ª página atual), **When** sync roda, **Then** os 5 viram archived
   no Sulco (`removed_count=5` na sync_run).
3. **Given** mesmo user com 2 discos novos no Discogs (na 1ª página
   atual), **When** sync roda, **Then** os 2 entram em `records`
   (`new_count=2` na sync_run).
4. **Given** user com `manual` ok anterior, **When** roda novo manual,
   **Then** comportamento INALTERADO (continua usando snapshot do
   manual anterior).

### User Story 2 — Cron diário primeiro acionamento (Priority: P1)

Mesmo problema, mas pelo cron 04:00 SP. User com `initial_import`
ok mas nunca rodou `daily_auto` com sucesso. Hoje o primeiro cron
trava 60s e morre como zombie.

**Why this priority**: cobre 100% dos novos DJs no piloto invite-only.
Sem fix, qualquer convidado que entrar vai sofrer da mesma trava.

**Independent Test**: chamar `/api/cron/sync-daily` com auth bearer
em ambiente que tem user com initial_import ok / zero daily_auto ok.
Esperado: cron termina ok, atualiza records.

### Edge Cases

- **Acervo recém-importado, ZERO syncs anteriores de qualquer tipo**:
  cenário irreal porque initial_import termina com snapshot. Mas se
  acontecer (bug em initial_import), o fallback retorna prevIds=[]
  e o comportamento é o atual (trata tudo como novo). Aceitável —
  não piora nada.
- **Snapshot do initial_import incompleto** (parcial): código atual
  `parseSnapshotIds` tolera JSON malformado retornando []. Inalterado.
- **manual rodado em paralelo com cron daily_auto**: hoje
  `killZombieSyncRuns` previne zombies. Cada kind respeita seu
  próprio gate de "running". Comportamento atual preservado.

## Requirements

### Functional Requirements

- **FR-001**: Sistema MUST chamar `fetchRelease(userId, releaseId)`
  APENAS para discos que ainda não existem em `records` do user
  (`isNew = true`). Pra discos já existentes, pular `fetchRelease` e
  pular `applyDiscogsUpdate`.
- **FR-002**: Comportamento de detecção de removidos MUST permanecer
  inalterado — comparação `prevIds (snapshot anterior) − currentIds
  (1ª página atual)` continua o mesmo.
- **FR-003**: Snapshot anterior MUST ser herdado entre kinds quando
  o atual não tem ok prévio:
  - `kind='manual'`: tenta manual → daily_auto (initial_import não
    é compatível porque não armazena IDs).
  - `kind='daily_auto'`: tenta daily_auto → manual.
  Se nenhum existe, `prevIds=[]` e zero remoções nesta execução
  (próxima já terá snapshot do mesmo kind).
- **FR-004**: Sistema MUST registrar log informativo (`console.info`)
  com origem do snapshot e total de IDs base pra debug.
- **FR-005**: `runIncrementalSync` MUST manter idempotência via
  `onConflictDoNothing` (já existe — não muda).

### Key Entities

Nenhum schema delta. Reusa `sync_runs.snapshotJson` existente.

## Success Criteria

- **SC-001**: Sync manual em user com initial_import-only termina em
  <15s com `outcome='ok'`. Validação manual em prod do Felipe.
- **SC-002**: Após o fix deployado, **drift de Felipe (5 removidos
  + 2 novos)** é detectado pelo primeiro sync manual: 5 archived,
  2 inseridos.
- **SC-003**: Zero regressão em syncs já funcionais (qualquer kind
  com ok anterior).

## Assumptions

- `initial_import.snapshotJson` está sempre completo (cobre todo o
  acervo até a página final). Verdade conforme `runInitialImport`
  em `src/lib/discogs/import.ts`.
- Manual e daily_auto representam o mesmo invariante (snapshot do
  acervo completo no Discogs no momento da execução), portanto
  intercambiáveis como base de comparação.

## Fora de escopo

- Reescrever `runIncrementalSync` pra ser stream/chunked (paginado).
  Esse era o fix "definitivo" mas requer redesign maior — fica como
  Incremento futuro se Bug 11 reaparecer pós-fix.
- Persistir `sync_runs.snapshot_kind_used` (qual kind serviu de base).
  Nice-to-have pra debug, mas zero impacto no comportamento.
