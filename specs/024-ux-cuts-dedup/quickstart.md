# Quickstart — Inc 26: Cortes UX agressivos + dedup de queries

**Feature**: 024-ux-cuts-dedup
**Audience**: Felipe (validação manual via Vercel logs + dashboard Turso)

---

## Pré-requisitos

- Inc 26 deployado em prod (`sulco.vercel.app`).
- Instrumentação `[DB]` ainda ativa (env var `DB_DEBUG` não setada ou =1).
- Terminal aberto com `vercel logs sulco.vercel.app --follow` rodando.
- DJ Felipe autenticado, import inicial reconhecido (`users.import_acknowledged_at` preenchido).

---

## Cenário 1 — Home `/` com ≤6 queries (US1, SC-001)

**Passos**:
1. Browser limpo (ou Cmd+Shift+R) em `sulco.vercel.app/`.
2. Aguardar 5s.
3. Voltar ao terminal `vercel logs`. Contar linhas `[DB]`.

**Esperado**:
- Exatamente 5-6 linhas `[DB]`:
  - 1× `SELECT users WHERE id = ?` (users PK, dedupado via `react.cache()`)
  - 1× `SELECT user_facets WHERE user_id = ?` (facets, dedupado)
  - 1× `SELECT records ... LIMIT 50 OFFSET 0` (queryCollection paginada)
  - 1× `SELECT tracks ... WHERE record_id IN (50 ids) GROUP BY` (track aggregations)
  - 1× `SELECT tracks ... WHERE record_id IN (50 ids) AND is_bomb = 1` (bombs)
- **Zero ocorrências** de:
  - `last_status_visit_at` (SyncBadge removido)
  - `SELECT COUNT(*) FROM records WHERE archived` em layout (ArchivedRecordsBanner removido)
  - `UPDATE sync_runs SET ... [run zumbi]` (killZombie movido pra cron)
  - `import_acknowledged_at` (ImportProgressCard condicional, não renderiza)

**Falha esperada se algo der errado**: > 8 queries por load → algum dedup ou corte falhou.

---

## Cenário 2 — Outras rotas autenticadas mantêm baixo custo (US1, SC-002)

**Passos**:
1. Em sequência: navegar `/` → `/sets` → `/conta` → `/disco/[primeiro_id]` → `/sets/[id]/montar` (qualquer set).
2. Para cada rota, contar linhas `[DB]` no log.

**Esperado**:
- `/sets`: ≤4 queries (users + listSets).
- `/conta`: ≤3 queries (users + getUserAIConfigStatus + outros pequenos).
- `/disco/[id]`: ≤5 queries (users + record + tracks + facets para shelves).
- `/sets/[id]/montar`: ≤6 queries (users + set + queryCandidates + facets para vocab).

**Antes de Inc 26**: cada rota tinha +5 queries adicionais do layout (SyncBadge 4 + ArchivedBanner 1).

---

## Cenário 3 — Hover em link não dispara prefetch (US1, SC-006)

**Passos**:
1. Estar em `/`.
2. Mover mouse sobre 5 cards de discos diferentes (sem clicar) durante 3s cada.
3. Verificar logs.

**Esperado**:
- Zero novas linhas `[DB]` durante os hovers.
- Antes de Inc 26: cada hover disparava prefetch RSC = ~5 queries por hover.

---

## Cenário 4 — Descoberta de archived/alertas via `/status` (US2)

**Passos**:
1. Em qualquer rota, abrir menu (desktop: nav top; mobile: hambúrguer).
2. Clicar em "Sync".
3. Verificar que `/status` carrega.

**Esperado**:
- `/status` exibe lista de archived pendentes (se houver) + lista de syncRuns (últimos 20).
- Layout/header não mostra mais `<SyncBadge>` (bolinha de "alertas") nem `<ArchivedRecordsBanner>` (banner amarelo do topo).
- Mesma informação acessível, apenas via pull (entrar em `/status`) em vez de push (banner global).

---

## Cenário 5 — Rota `/curadoria` retorna 404 (US3)

**Passos**:
1. Acessar diretamente `sulco.vercel.app/curadoria`.
2. Acessar `sulco.vercel.app/curadoria/concluido`.

**Esperado**:
- Ambas retornam 404 (página padrão Next.js "This page could not be found").
- Menu desktop e mobile não exibem mais o item "Curadoria".
- Nenhuma query `[DB]` é executada (rota inexistente, middleware Clerk pode rodar antes do 404 — aceitável).

---

## Cenário 6 — Cold start Lambda ≤600ms (SC-003)

**Passos**:
1. Aguardar 5+ minutos sem acessar `sulco.vercel.app` (garantir Lambda fria).
2. Hard refresh em `/`.
3. No Vercel dashboard → Logs → clicar no request → ver "Function Duration".

**Esperado**:
- Duration ≤600ms (vs ~1.2s pré-Inc 26).
- Tempo dominado por: 1× SELECT users (~200ms cold) + 1× SELECT user_facets (~80ms) + 1× queryCollection (~150ms) + render (~100ms).

**Falha**: ≥1s indica que dedup não funcionou (3 SELECTs users em paralelo somando ~800ms eram dominantes).

---

## Cenário 7 — DJ com import em andamento ainda vê o card (Edge Case)

**Setup**: usuário fictício com `outcome='running'` em sync_runs (ou simular limpando `import_acknowledged_at`).

**Passos**:
1. Login com user de teste sem ack.
2. Carregar `/`.

**Esperado**:
- `<ImportProgressCard>` aparece normalmente.
- Logs mostram queries adicionais: `sync_runs latest`, `users.import_acknowledged_at`, `getUserFacets` (extra) — só nesse caso edge.
- Total de queries pode chegar a 9-10 — aceitável porque é estado transitório (import inicial).

---

## Cenário 8 — Cron diário limpa zombies (SC-007)

**Passos**:
1. Aguardar próxima execução do cron `/api/cron/sync-daily` (ou disparar manualmente via curl com header `Authorization: Bearer $CRON_SECRET`).
2. Verificar logs do cron.

**Esperado**:
- Cron loga `[cron sync-daily] killing zombies for user N` (ou similar).
- Após cron, qualquer syncRun com `outcome='running'` há > 65s vira `outcome='erro'` com `error_message='[run zumbi; processo morreu]'`.

---

## Cenário 9 — Smoke test fluxos principais (SC-007, SC-008)

**Passos**:
1. `/` — listar coleção. Filtrar por gênero. Mudar página. ✓
2. `/disco/[id]` — abrir disco. Marcar 1 faixa como selected. ✓
3. `/sets/[id]/montar` — adicionar 1 candidato a um set existente. ✓
4. `/status` — ver runs + archived pendentes. ✓
5. `/conta` — ver config IA + Discogs. ✓

**Esperado**:
- Nenhum erro 500.
- Nenhum erro JS no console do browser.
- Mutations funcionam normalmente (status update, curation, add to set).
- Nenhuma regressão visual além das remoções planejadas (badge + banner).

---

## Cenário 10 — Medição global de impacto (SC-004, SC-005)

**Setup**: anotar contador de "Rows Read" no dashboard Turso ANTES da medição.

**Passos**:
1. Sessão típica de uso (15 min): home + filtros + 5 discos + 1 montar + 5 status checks.
2. Anotar contador depois.
3. Calcular delta.

**Esperado**:
- Delta de reads na sessão ≤ 5k rows (vs ~50-70k antes do Inc 26 + Inc 24).
- Projeção pra 50 sessões/dia (1 user intenso): ≤250k reads/dia.
- Projeção pra 5 users (mesmo padrão): ≤1.25M reads/dia → ~37M/mês → 7.5% do free tier.

---

## Encerramento

Cobertura mínima: cenários 1 (home dedup), 4 (alertas via /status), 5 (curadoria 404), 9 (smoke fluxos).

Se todos passarem: setar `DB_DEBUG=0` em prod via Vercel env vars (desliga instrumentação sem revert de código). Próxima feature pode reativar via env var quando precisar.

Se Cenário 1 falhar (queries > 6): inspecionar logs `[DB]` linha por linha para identificar qual query duplicada/extra ainda está disparando. Cause raiz provável: `react.cache()` não wrappou alguma função, ou algum import de `<SyncBadge>`/`<ArchivedRecordsBanner>` foi esquecido.
