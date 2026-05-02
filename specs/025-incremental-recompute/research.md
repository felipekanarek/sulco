# Research — Recompute incremental + dedups remanescentes em /disco/[id]

**Phase**: 0
**Status**: complete
**Source**: diagnóstico de logs `[DB]` em prod (sessão 2026-05-02 pós Inc 26) + decisões do mantenedor

## Decisões

### Decisão 1 — Delta updates direcionados em vez de recompute completo

- **Decision**: substituir `await recomputeFacets(user.id)` no fim de Server Actions de write por chamadas de helpers específicos baseados em qual campo mudou. Helpers novos em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts).
- **Rationale**: log em prod mostrou que `recomputeFacets` faz 7 queries pesadas (~50-100k rows lidas) toda chamada. DJ típico cura 1 disco com 30-50 edições → ~2M rows lidas por curadoria. Inviável em qualquer plano gratuito. Delta updates levam custo a ~3-10 reads por edição.
- **Alternatives considered**:
  - Manter `recomputeFacets` mas mover pra `unstable_after()` (Next 15 background): elimina latência da Server Action mas **não reduz** count total de rows lidas. Não resolve o problema da cota. Descartado.
  - Cache de `recomputeFacets` resultado por TTL: no Vercel Hobby cache é no-op (Lambdas frescas). Já provado ineficaz no Inc 23.
  - Trigger SQL dentro do banco: SQLite suporta TRIGGERs, mas adiciona complexidade e move lógica pra fora do código TypeScript (Princípio III — Schema é fonte; mas lógica de delta é regra de negócio, melhor em código). Descartado.
  - Recompute completo no fim mas em batch (por janela de N segundos): introduz latência variável + ainda recomputa periodicamente. Descartado.
- **Implicação técnica**: para cada Server Action, decidir explicitamente qual delta aplicar. Documentado em [contracts/facets-delta-helper.md](./contracts/facets-delta-helper.md).

### Decisão 2 — Skip total para edições sem impacto em facets

- **Decision**: edições em campos que **não estão materializados** em `user_facets` não disparam delta algum.
- **Campos sem impacto** (skip): `bpm`, `musicalKey`, `energy`, `comment`, `rating`, `fineGenre`, `references`, `isBomb`, `aiAnalysis`, `notes`, `audioFeaturesSource`, `previewUrl`/`previewUrlCachedAt`.
- **Rationale**: `user_facets` materializa apenas: counters de records por status, tracksSelectedTotal, lista de genres/styles/moods/contexts/shelves. Editar BPM ou comment não muda nada disso. Hoje recomputa-se mesmo assim — desperdício total.
- **Estimativa**: ~80% das edições em curadoria caem nessa categoria (DJ ajustando BPM/comment/rating/aiAnalysis nas faixas).
- **Alternatives considered**: nenhuma. Skip é trivialmente correto.

### Decisão 3 — Recompute parcial para vocabulary (moods/contexts) e shelves

- **Decision**: quando `moods` ou `contexts` de uma faixa mudam, recomputar **apenas** o vocabulário daquele kind via 1 query JOIN tracks + json_each + DISTINCT. Mesmo padrão para `shelfLocation` (1 query DISTINCT shelf_location).
- **Rationale**: incrementar/decrementar lista de strings é complexo (precisa saber se o termo ainda aparece em outras faixas/discos). Mais simples e seguro: recompute idempotente do conjunto inteiro do kind afetado. Custo: ~10k reads (tracks JOIN) ou ~2.5k reads (shelves) — só roda quando realmente muda esse campo (raro em curadoria típica).
- **Trade-off aceito**: edição que muda APENAS moods (sem mudar status nem selected) ainda custa ~10k reads. Mas DJ adiciona/remove vocab poucas vezes por sessão (normalmente edita BPM/comment/selected, que são skip).
- **Alternatives considered**:
  - Manter um "índice reverso" (term → set of trackIds): adiciona complexidade enorme, mais write paths. Descartado.
  - Recompute completo apenas pra esses casos: equivalente em custo, mas faz queries irrelevantes (genres/styles/counts). Descartado.

### Decisão 4 — Cron noturno como fallback de drift

- **Decision**: cron diário em [src/app/api/cron/sync-daily/route.ts](../../src/app/api/cron/sync-daily/route.ts) (que já roda 1×/dia e itera todos os users) ganha 1 chamada `await recomputeFacets(userId)` por user no fim. Detecta drift via comparação opcional (log) ou simplesmente UPSERT — se valores estavam diferentes, ficam corretos.
- **Rationale**: garante que mesmo edge cases (race rara, edição via SQL direto, bug em delta logic) sejam corrigidos em ≤24h. Custo: 7 queries pesadas × N users × 1×/dia. Para Felipe (1 user) = 7 queries/dia = irrelevante. Para 10 users = 70 queries/dia.
- **Trade-off**: drift visível por até 24h. Em prática invisível pro DJ porque counters em `user_facets` são exibidos em filtros/contadores secundários (não na tela principal de curadoria). Aceito.
- **Alternatives considered**:
  - Cron de 6h (4×/dia): reduz janela de drift mas quadruplica custo. Pra escala atual, 24h é OK.
  - Detecção em-tempo-real (heartbeat de drift): complexidade alta, sem ganho proporcional. Descartado.
  - Cron separado pra recompute (não junto com sync-daily): mais infra, mais env vars. Descartado.

### Decisão 5 — Estado anterior vs novo é input explícito do helper de delta

- **Decision**: `applyRecordStatusDelta(userId, prev, next, archivedFlag)` recebe `prev` (status anterior) e `next` (novo status). Server Action precisa **carregar status atual** antes do UPDATE pra ter `prev`. Custo: +1 query por write (já feita pela ownership check em alguns casos).
- **Rationale**: sem `prev`, o helper não sabe qual counter decrementar. Alternativa "naive" (sempre incrementar `next`, decrementar `prev` derivado de outro lookup) duplica queries. Mais limpo passar como input.
- **Implementação**: `updateRecordStatus` já faz `SELECT { status }` ownership check em alguns paths; estender pra trazer `status` atual (custo: 0 queries adicionais — mesma query). Em outros paths, fazer SELECT prévio (1 query barata, indexada por PK).
- **Alternatives considered**:
  - UPDATE com RETURNING old + new: SQLite suporta `RETURNING *` mas não retorna valor anterior atomically. Postgres tem `RETURNING old.*` em update via CTE; SQLite/libsql não. Descartado.

### Decisão 6 — `aiProvider`/`aiModel` em `CurrentUser` (Frente B)

- **Decision**: estender tipo `CurrentUser` em [src/lib/auth.ts](../../src/lib/auth.ts) com `aiProvider: string | null` e `aiModel: string | null`. Mapper `toCurrentUser` ganha esses campos. `getCurrentUser` continua wrappado em `cache()` (Inc 26).
- **Rationale**: log em prod mostrou `select "ai_provider", "ai_model" from "users" where ...` rodando a cada render do disco — separado do `getCurrentUser` cacheado. 1 query desnecessária por render (~30 queries/curadoria). Incluir no objeto cached elimina sem custo.
- **Importante — segurança**: NÃO incluir `aiApiKeyEncrypted` no objeto cached. Funções como `enrichTrackComment` que de fato chamam o provider externo continuam fazendo SELECT dedicado pra chave (princípio de menor exposição — chave criptografada exposta apenas onde necessário).
- **Alternatives considered**:
  - `react.cache()` em `getUserAIConfigStatus`: funcionaria mas `getUserAIConfigStatus` faz SELECT só dos 2 campos públicos. Mais limpo já trazer no `CurrentUser` (1 SELECT pega tudo).
  - `getUserAIConfigStatus` deletada e callers migram pra ler de `requireCurrentUser`: ideal, mas compatibilidade com locais que não têm `requireCurrentUser` na mão (ex: `enrichTrackComment` que recebe userId direto). Manter `getUserAIConfigStatus` mas internamente também pode usar cache. Decidir caso a caso na implementação.

### Decisão 7 — Frente D: audit revalidatePath (cleanup pontual)

- **Decision**: grep todos os `revalidatePath('...')` em `src/lib/actions.ts` e `src/lib/discogs/`. Remover paths que apontam para rotas inexistentes (Inc 26 deletou `/curadoria`). Documentar lista no plan.
- **Rationale**: revalidatePath em rota inexistente é silenciosamente no-op em runtime (não quebra), mas indica débito técnico. Limpar agora junto da feature evita confusão.
- **Não-decisão**: NÃO migrar `revalidatePath` para `revalidateTag`. Ganho marginal vs complexidade adicional não compensa.
- **Alternatives considered**: status quo (deixar paths obsoletos). Custo zero, mas suja code base.

### Decisão 8 — Try/catch defensivo em torno de cada delta (preservar pattern atual)

- **Decision**: cada chamada de delta no fim de Server Action fica em try/catch que captura erro, loga `[applyDelta] erro pós-write (action_name): err`, e **não falha** a Server Action principal. Mesma estratégia atual do `recomputeFacets`.
- **Rationale**: write principal (UPDATE em records/tracks) já foi committado e tem valor pro DJ. Falha no delta não justifica reverter o write principal. Drift residual será corrigido pelo cron.
- **Alternatives considered**:
  - Transaction única envolvendo write + delta: SQLite/libsql suporta. Mais correto teoricamente. **Considerar para Inc futuro** se drift mostrar-se problema. Por ora, mais simples manter sem.

## Edge cases adicionais (auditoria pós-tasks)

### FR-007 — UPDATE retornando 0 rows afetadas

A implementação usa **comparação pré-UPDATE** (`prev.status !== next` em T005, `prev.selected !== next` em T006, etc.) em vez de checar `rowsAffected === 0` pós-UPDATE. Equivalência prática:

- Ownership check existente já garante que o record/track pertence ao user antes do UPDATE.
- Se prev !== next mas record sumiu entre prev-check e UPDATE (race extremamente improvável), o UPDATE é no-op e o delta seria errado em ±1 unidade. Drift transitório corrigido pelo cron noturno.
- Aceito por simplicidade. Mais correto seria envolver tudo em transaction única (`db.transaction(...)`), considerar para Inc futuro.

### Concurrent writes em `applyRecordStatusDelta`

Diferente de `applyTrackSelectedDelta` (que usa expressão atômica `± 1`), `applyRecordStatusDelta` precisa do `prev` carregado pelo Server Action. Cenário de race:

1. DJ clica "Ativar" no disco X (status atual: unrated). Action 1 inicia.
2. DJ clica "Ativar" novamente (multi-tab, ou clique acidental antes da resposta).
3. Action 1 lê prev=unrated. Action 2 lê prev=unrated.
4. Action 1 executa UPDATE records SET status=active (commitado).
5. Action 2 executa UPDATE records SET status=active (no-op pra records, mas delta foi calculado com prev=unrated).
6. Action 1 aplica delta: -1 unrated, +1 active. (correto)
7. Action 2 aplica delta: -1 unrated, +1 active. (errado — duplicação)
8. Resultado: -2 unrated, +2 active. **Drift de +1 unrated, -1 active**.

Aceito por design no contexto Felipe-solo (raríssimo) e cron noturno corrige em ≤24h. Para escala maior (5-10 amigos), se observado, considerar:
- Wrapping em transaction (`db.transaction(async tx => { read prev; UPDATE; delta })`).
- Verificar `rowsAffected` do UPDATE e pular delta se = 0 (Action 2 do exemplo acima teria UPDATE no-op se status já era active — mas Action 2 lê prev=unrated, então Action 2 acha que está mudando).

Mitigation atual: cron correção drift; documentar no PR.

## Riscos identificados (e mitigações)

1. **Lógica de delta incorreta** (ex: incrementa wrong counter) → causa drift visível.
   - Mitigação: cron noturno corrige; quickstart inclui cenário de "edita 1 disco, conferir contador" para detectar regressão precoce.

2. **Server Action sem delta** (esquecido em algum write) → drift permanente nessa categoria.
   - Mitigação: checklist explícito no contrato `applyDeltaForWrite` listando todos os writes que tocam facets. Code review.

3. **Concurrent writes em mesmo counter** → SQLite serializa, mas se delta calcula `prev` antes do write, pode haver race com outra Server Action concorrente.
   - Mitigação: usar UPDATE com expressão idempotente (`= column ± 1`) em vez de SELECT-then-UPDATE com valor calculado. Aplicável a counters numéricos. Para vocabulary recompute, race resulta em "vence o último a chamar" — aceitável.

4. **Cron falhando** → drift acumula > 24h.
   - Mitigação: Vercel cron tem retries; cron-job.org pode ser fallback externo. Para Felipe solo, drift de 48-72h é aceitável (impacto: contadores secundários ligeiramente errados).

5. **Performance do recompute parcial vocabulary** ainda alta (~10k reads).
   - Mitigação: aceito porque é raro (DJ adiciona vocab poucas vezes). Otimização futura: índice em `tracks(record_id)` JOIN com filtro por archived seria útil mas requer schema delta.

## Não-decisões (out of scope desta feature)

- Frente C (wrap `loadDisc` em `react.cache()`) — explicitamente excluída pelo mantenedor.
- Denormalizar `tracksTotal`/`tracksSelected`/`hasBombs` em `records` (Inc 25 do plano original) — fica para Inc futuro se necessário.
- Migração para Postgres/Supabase/Cloudflare D1 — descartada nas pesquisas anteriores.
- Embedded replicas Turso — descartado (não roda em Vercel Hobby clássico; vercel-experimental é BETA).
