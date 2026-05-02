# Research — Cortes UX agressivos + dedup de queries

**Phase**: 0
**Status**: complete
**Source**: diagnóstico de logs Vercel sessão 2026-05-02 + decisões de produto Felipe

## Decisões

### Decisão 1 — Dedup via `react.cache()` (não `unstable_cache` do Next)

- **Decision**: usar `cache()` do React 19 (re-exportado via `import { cache } from 'react'`) para wrappar `requireCurrentUser`/`getCurrentUser` em [src/lib/auth.ts](../../src/lib/auth.ts) e `getUserFacets` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts).
- **Rationale**: `react.cache()` dedupa **dentro do mesmo request RSC** (escopo: 1 render server). É exatamente o que precisamos pra eliminar as 4-5 chamadas paralelas que vimos nos logs `[DB]` (todas no mesmo render). Não persiste entre Lambdas (irrelevante: no Vercel Hobby Lambdas são sempre fresh).
- **Alternatives considered**:
  - `unstable_cache` do Next: persiste entre requests via Data Cache, mas no Vercel Hobby a Data Cache é **per-Lambda-instance** e cada request frequentemente cria Lambda nova → cache miss. Já provado ineficaz no Inc 23.
  - Map in-memory global no módulo: tentado no Inc 22, falhou pelo mesmo motivo (Lambda fresh).
  - Não fazer dedup: 4-5 SELECTs users + 4-5 SELECTs user_facets por load = ~10 queries duplicadas, custo direto na cota Turso.

### Decisão 2 — `<SyncBadge>` removido (não condicional)

- **Decision**: deletar `src/components/sync-badge.tsx` + helper `computeBadgeActive` em [src/lib/queries/status.ts](../../src/lib/queries/status.ts). Remover import + uso em [src/app/layout.tsx](../../src/app/layout.tsx).
- **Rationale**: Felipe explicitamente disse "pode tirar". Badge custava 4 queries/load × N rotas autenticadas. Info acessível via menu → `/status`. Para escalar 5-10 usuários, custo > valor.
- **Alternatives considered**:
  - Manter mas com TTL cache (já feito no hotfix Inc 23): no Vercel Hobby TTL é no-op. Inútil.
  - Mover pra client component que faz fetch async: introduz JS no client + 1 round-trip extra. Sem ganho líquido.
  - Lazy via Suspense: ainda dispara queries; só atrasa render.

### Decisão 3 — `<ArchivedRecordsBanner>` removido (não condicional)

- **Decision**: deletar `src/components/archived-records-banner.tsx`. Remover import + uso em [src/app/layout.tsx](../../src/app/layout.tsx).
- **Rationale**: mesma lógica do SyncBadge. 1 query COUNT por load × N rotas. Info já presente em `/status` (lista archivedPending). Banner era informacional/redundante.
- **Alternatives considered**:
  - Mover pra `/` apenas: viola simetria — DJ ativo em outras rotas (`/sets`, `/conta`) também precisaria saber. Mas a verdade é que descoberta via menu é suficiente para evento raro (archive).
  - Cache TTL: no-op em Hobby (ver Decisão 1).

### Decisão 4 — `<ImportProgressCard>` condicional baseado em `progress`

- **Decision**: em [src/app/page.tsx](../../src/app/page.tsx), só renderizar `<ImportProgressCard>` quando `progress.outcome === 'running'` OU `progress.runStartedAt && (!progress.lastAck || progress.runStartedAt > progress.lastAck)`. Caso contrário, **não chamar** `getImportProgress` no Promise.all e não renderizar o componente.
- **Rationale**: para o usuário com import já reconhecido (caso comum em uso diário), o componente aparece apenas brevemente após import inicial. 99% das visitas ele não precisa. Eliminar a chamada ao `getImportProgress` poupa 3 queries (`syncRuns latest` + `users.lastAck` + `getUserFacets` 5° call).
- **Trade-off**: para sinalizar "há novo import disponível" (estado `idle` mas com run mais novo que lastAck), precisamos de **alguma** query. Solução: usar uma única query barata `SELECT EXISTS (SELECT 1 FROM sync_runs WHERE user_id = ? AND started_at > COALESCE(?, 0) AND outcome = 'running') OR (started_at > COALESCE(lastAck,0))`. Mas isso ainda é 1 query.
- **Decision refinada**: aceitar que **se import está rodando, o card aparece**. Detecção precisa de 1 query (`SELECT outcome FROM sync_runs WHERE user_id=? ORDER BY started_at DESC LIMIT 1`). O componente em si lê `progress` que retorna do RSC. Vamos estruturar assim: `getImportProgressLight()` = 1 query mínima retornando `{ shouldShow: boolean, fullProgress?: ImportProgress }`. Se `shouldShow=false`, não renderiza nada e não chama nada mais. Se `true`, retorna progress completo (custo igual ao atual, mas só nos 1% de loads).
- **Alternatives considered**:
  - Sempre carregar progress (status quo): custo desnecessário em 99% dos loads.
  - Usar lastAck cookie: bypassa DB mas requer escrita de cookie no ack — fragmenta estado.

### Decisão 5 — `killZombieSyncRuns` move pra cron diário

- **Decision**: remover chamadas em [src/lib/actions.ts:247](../../src/lib/actions.ts) (`getImportProgress`) e [src/lib/queries/status.ts:62](../../src/lib/queries/status.ts) (`loadStatusSnapshot`). Adicionar 1 chamada explícita em [src/app/api/cron/sync-daily/route.ts](../../src/app/api/cron/sync-daily/route.ts) antes do sync. Iterar todos os users (1×/dia).
- **Rationale**: zombie é evento raro (Lambda morre durante sync). Detectá-lo a cada load gasta 1 UPDATE/load. Detectar 1×/dia é suficiente — pior caso DJ vê "running..." por até 24h, depois é limpo.
- **Trade-off aceito**: latência de cleanup ↑. Custo: cota cai.
- **Alternatives considered**:
  - Manter mas só em rotas raras (`/status`): mantém o problema parcial.
  - Detectar inline ao ler `getImportProgress` mas só se outcome='running' há > 65s: ainda 1 read extra.

### Decisão 6 — `/curadoria` deletada por completo

- **Decision**: deletar `src/app/curadoria/page.tsx`, `src/app/curadoria/concluido/page.tsx`, `src/components/curadoria-view.tsx` (verificar callers antes), `src/lib/queries/curadoria.ts` se sem callers. Remover NavLink "Curadoria" em [src/app/layout.tsx](../../src/app/layout.tsx) e em [src/components/mobile-nav.tsx](../../src/components/mobile-nav.tsx).
- **Rationale**: Felipe declarou rota morta. DJ usa fluxo direto via `/disco/[id]` (acessível pela home). Remoção elimina helper `listCuradoriaIds` (potencial scan de records) e simplifica menu.
- **Alternatives considered**:
  - Manter mas com paginação: keep alive de feature não-usada gera dívida.
  - Deprecar com banner: ruído em UI; rota morta ≠ deprecada.

### Decisão 7 — `prefetch={false}` universal em links autenticados

- **Decision**: auditar todos os `<Link>` em `src/app/**` e `src/components/**` que apontam para rotas autenticadas. Adicionar `prefetch={false}` onde faltar.
- **Rationale**: hover sobre link no Next 15 dispara prefetch RSC (= queries em background). Felipe aceitou trade-off de UX (nav 100-200ms mais lenta) em troca de zero leak de queries.
- **Implementação**: grep + audit. Lista mínima esperada: home → record cards (já têm), home → paginação (já têm), layout → menu (já têm), `/disco/[id]` → outros discos (auditar), `/sets/[id]/montar` → candidate rows (auditar), `/sets/[id]` → editar (auditar), `/admin` → convites (auditar).
- **Alternatives considered**:
  - `prefetch={true}` em links críticos (paginação): UX melhor, mas dispara 1 RSC por hover. Em DJ scrolling+hovering pode multiplicar. Não compensa.

### Decisão 8 — Instrumentação `[DB]` permanece ligada durante validação

- **Decision**: deixar wrapper de [src/db/index.ts](../../src/db/index.ts) ativo durante a validação (cenários do quickstart). Após sucesso confirmado em prod, desligar via env var `DB_DEBUG=0` no Vercel (sem revert de código). Reverter o wrapper inteiro num commit pós-Inc 26.
- **Rationale**: precisamos ver os logs `[DB]` pra confirmar que dropou de 17→6. Mantê-lo ativo durante deploy é zero-risco (apenas aumenta verbosidade dos logs Vercel).
- **Alternatives considered**:
  - Reverter junto: perde-se a capacidade de medir antes/depois.
  - Deletar permanentemente: útil em futuras investigações; manter como toggle via env var é compromisso bom.

## Riscos identificados (e mitigações)

1. **Risco**: ímpcito de remover `<SyncBadge>` — DJ pode não notar archived/conflicts.
   - Mitigação: scenario quickstart 4 testa fluxo de descoberta via menu.

2. **Risco**: `react.cache()` não funcionar como esperado (ex: cache key colisão entre requests).
   - Mitigação: `react.cache()` é per-render-tree do React 19. Documentação clara. Smoke test cobre.

3. **Risco**: `getImportProgress` condicional quebrar fluxo de import inicial (DJ que ainda não rodou import).
   - Mitigação: cenário quickstart 5 testa com user fictício sem ack.

4. **Risco**: `killZombieSyncRuns` only no cron — zombie persiste >24h se cron falhar.
   - Mitigação: cron já tem alerta de falha (`vercel.json`). Risco aceito por Felipe.

5. **Risco**: `prefetch={false}` universal piora UX percebido.
   - Mitigação: nav já é rápida em SSR; usuários acostumados a apps web. Aceito por Felipe.

## Não-decisões (out of scope)

- Denormalizar `tracksTotal/Selected/hasBombs` em records — fica para Inc 25.
- Recompute incremental de `recomputeFacets` — fica para Inc 27.
- Migrar pra Supabase ou Cloudflare D1 — descartado (esforço > ganho).
- Pagar Turso Developer ($4.99/mês) — descartado (Felipe quer zero gasto).
- Embedded replicas — fica como plano B se Inc 25-27 não bastarem.
