# Research — Inc 23: Otimização de leituras Turso

**Feature**: 022-turso-reads-optimization
**Date**: 2026-04-30

Decisões de design tomadas antes de Phase 1.

---

## Decisão 1 — Cache layer via `unstable_cache` do Next 15

**Decision**: usar `unstable_cache` (`next/cache`) para envolver
queries de leitura. Sem dependência externa (Redis,
in-memory store).

**Rationale**:
- Já vem com Next 15. Zero deps novas.
- Persiste no Data Cache do Vercel (per-region em Hobby) →
  funciona out-of-the-box em prod sem config extra.
- Tags + revalidação integrados com pipeline `revalidateTag` já
  usado pelo projeto.
- TTL nativo via opção `revalidate` (Decisão 5).

**Alternatives considered**:
- **In-memory cache (Map global)**: rejeitado — não persiste
  entre invocations serverless; não é shared.
- **Redis externo (Upstash, etc)**: rejeitado — over-engineering;
  custo extra; pra escala atual, Vercel Data Cache é
  suficiente.
- **`cache()` do React 19 (deduplicação por request)**: rejeitado
  isoladamente — só dedup intra-request, não persiste entre
  visitas. Pode ser combinado depois com `unstable_cache` se
  vier benefício, mas o ganho principal vem do Data Cache.

---

## Decisão 2 — Helper `cacheUser` DRY

**Decision**: criar helper `cacheUser(fn, name, options?)` em
[src/lib/cache.ts](../../src/lib/cache.ts) que envolve uma
function existente (assinatura `(userId, ...rest) => Promise<T>`)
com `unstable_cache` aplicando pattern padrão:

```typescript
import { unstable_cache } from 'next/cache';

const DEFAULT_REVALIDATE = 300; // 5min (Clarification Q2)

export function cacheUser<TArgs extends unknown[], TReturn>(
  fn: (userId: number, ...rest: TArgs) => Promise<TReturn>,
  name: string,
  options?: { revalidate?: number },
): (userId: number, ...rest: TArgs) => Promise<TReturn> {
  return async (userId: number, ...rest: TArgs) => {
    const cached = unstable_cache(
      () => fn(userId, ...rest),
      [name, String(userId), ...rest.map(serializeArg)],
      {
        tags: [`user:${userId}`],
        revalidate: options?.revalidate ?? DEFAULT_REVALIDATE,
      },
    );
    return cached();
  };
}

function serializeArg(arg: unknown): string {
  // Serialização determinística pra cache key.
  // Object → JSON ordenado; arrays → join; primitives → String.
  if (arg === null || arg === undefined) return '';
  if (typeof arg === 'object') return JSON.stringify(arg, Object.keys(arg as object).sort());
  return String(arg);
}
```

**Rationale**:
- Pattern uniforme nas 7 queries cacheadas.
- DRY: não repetir cache key, tags, ttl em cada callsite.
- `name` separado garante que mesmas args em queries diferentes
  não colidem.
- Sortear keys da serialização: `JSON.stringify` com keys
  ordenadas é determinístico (cache key consistente entre
  invocations).

**Alternatives considered**:
- **Aplicar `unstable_cache` diretamente em cada query**:
  rejeitado — duplicação garantida; pequenos erros de tag/key
  fragmentam invalidation.

---

## Decisão 3 — Tag por user (não por query)

**Decision**: tag única `user:${userId}` cobre todas as queries
cacheadas. `revalidateTag('user:42')` invalida tudo do user 42.

**Rationale**:
- Simplifica invalidation: Server Actions de write chamam
  `revalidateUserCache(userId)` ao final, sem precisar saber
  quais queries específicas afetam.
- Trade-off: invalidation grossa (todas queries do user
  re-executam após qualquer write). Aceitável porque writes
  são raros vs reads, e re-execução de query única na próxima
  visita é barata.
- Multi-user isolation: `user:${userId}` separa users — DJ A
  invalidando não toca cache de DJ B.

**Alternatives considered**:
- **Tag granular por query** (`['user:42', 'collection-counts']`):
  rejeitado — exige saber quais tags invalidar em cada Server
  Action, fácil de errar; ganho marginal.
- **Tag global `'collection'`**: rejeitado — invalidaria todos
  users, vaza isolation.

---

## Decisão 4 — Cache key composto para `queryCollection`

**Decision**: `queryCollection(q: CollectionQuery)` recebe
filtros (status, text, genres, styles, bomba). Cache key absorve
todos via `serializeArg` da Decisão 2.

```typescript
// Exemplo de cache key gerado pra queryCollection:
['queryCollection', '42', 'unrated', 'joao', 'samba|jazz', '', 'any']
```

**Rationale**:
- Clarification Q1 cristalizou: cachear `queryCollection` apesar
  de filtros dinâmicos.
- Felipe usa conjunto pequeno de combinações recorrentes
  (sem filtro, `?status=unrated`, alguns gêneros) — hit rate
  alto.
- Fragmentação esperada: ~5-10 variantes por user no uso
  típico. Cada uma ocupa ~10KB cache. Total <100KB por user —
  bem dentro do limite Hobby.

**Alternatives considered**:
- **Não cachear `queryCollection`** (Option B na clarify): seria
  o caso simples mas perde o maior ganho de reads.
- **Cache só quando filtros vazios** (Option C na clarify):
  meio termo; Felipe escolheu A (cobertura completa).

---

## Decisão 5 — TTL = 300s (5min)

**Decision**: `revalidate: 300` aplicado a todas as queries
cacheadas. Clarification Q2.

**Rationale**:
- Guard-rail contra bug de invalidação esquecida em alguma
  Server Action.
- 5min é o sweet spot: cache hit dentro da janela = 0 reads;
  miss apenas a cada 5min máximo.
- Caso típico: DJ navega home, abre disco, volta — toda essa
  sequência consome 1 cache miss + N hits. Bem dentro da janela.

**Alternatives considered**:
- **Sem TTL**: rejeitado — risco de stale eterno (Option A na
  clarify).
- **TTL 60s**: rejeitado — agressivo demais; multiplica reads.
- **TTL 1h**: rejeitado — janela de stale grande demais se
  invalidação esquecer.

---

## Decisão 6 — `pickRandomUnratedRecord`: fast path SQL quando text vazio

**Decision**:
- Quando `text` está vazio (caso comum): voltar pra
  `ORDER BY RANDOM() LIMIT 1` SQL — 1 row read.
- Quando `text` está presente (raro): manter JS post-filter
  do Inc 18 — ~2500 reads.

**Rationale**:
- Botão 🎲 é clicado tipicamente sem termo de busca digitado
  (DJ quer "qualquer disco unrated"). Fast path domina o caso
  real.
- Quando há text, é DJ tentando random dentro de subset
  filtrado — caso minoria, custo aceito.
- Comportamento observável idêntico (random uniforme, ownership
  preservada).

**Alternatives considered**:
- **Sempre JS post-filter**: rejeitado — penaliza o caso comum
  desnecessariamente.
- **Sempre SQL random**: rejeitado — perde Inc 18 pra random.

---

## Decisão 7 — `queryCandidates`: re-aplicar LIMIT 1000 SQL

**Decision**: voltar a aplicar `.limit(1000)` SQL no
`queryCandidates`. Text filter accent-insensitive permanece
pós-SQL.

**Rationale**:
- Limit 1000 vs 300 anterior: 3x mais permissivo, mas
  ainda evita worst case ~10k reads.
- Filtros não-text (`status='active'`, `archived=0`,
  `selected=true`, eventuais gêneros/estilos/bomba/bpm range)
  reduzem o conjunto elegível drasticamente. Felipe com ~10k
  tracks total tem tipicamente <500 elegíveis com filtros
  típicos aplicados.
- Edge case raro: DJ sem nenhum filtro não-text (apenas text)
  pode ter todos os ~5k tracks ativos como candidatos elegíveis
  → trunca em 1000. Aceito como trade-off pro hotfix.

**Alternatives considered**:
- **Limit 300 (anterior)**: rejeitado — agressivo demais; pode
  cortar candidatos válidos.
- **Limit 5000**: rejeitado — quase sem ganho vs unbounded
  no pior caso; reads continuam altos.
- **Sem limit (status pós-Inc 21)**: rejeitado — é exatamente
  o problema atual.

---

## Decisão 8 — Índices composite ordering

**Decision**:

- `records(user_id, archived, status)`:
  ordem `(userId, archived, status)`.
- `tracks(record_id, is_bomb)`:
  ordem `(recordId, isBomb)`.

**Rationale (records index)**:
- Queries usam `WHERE userId = ? AND archived = ? [AND
  status = ?]`. Coluna mais seletiva primeiro: `userId`
  (separa users), depois `archived` (boolean — quase tudo é
  `false`), depois `status` (3 valores).
- Compatível com queries que filtram só `userId + archived`
  (não precisam de status) — index cobre prefix.

**Rationale (tracks index)**:
- `WHERE recordId IN (...) AND isBomb = true` é o pattern do
  bomb lookup. `recordId` primeiro (alta cardinalidade),
  `isBomb` segundo.

**Alternatives considered**:
- **`records(archived, user_id, status)`**: rejeitado — `userId`
  precisa vir primeiro pra index ser eficaz cross-user.
- **`tracks(is_bomb, record_id)`**: rejeitado — `is_bomb=true` é
  raro mas cardinalidade baixa; melhor `record_id` primeiro.
- **Index parcial `WHERE is_bomb = 1`**: rejeitado por ora —
  SQLite suporta mas exige migration mais cuidadosa; ganho
  marginal vs composite simples.

---

## Decisão 9 — Aplicar migration via Turso shell em prod

**Decision**: schema delta de 2 índices vai pra `schema.ts`
(rastreabilidade) e migration SQL aplicada manualmente via
`turso db shell sulco-prod` em prod.

**Rationale**:
- Mesmo padrão Inc 010/012/013 já documentado em CLAUDE.md
  (`db:push` interactive falha em non-TTY). Anti-pattern
  conhecido do projeto.
- `CREATE INDEX IF NOT EXISTS` é idempotente e online (sem
  downtime).
- Local dev: aplicar via `sqlite3 sulco.db < migration.sql` ou
  manualmente.

**Alternatives considered**:
- **`drizzle-kit migrate`**: rejeitado — projeto não usa pipeline
  de migrations Drizzle; costume é direto.
- **Aplicar em sync de Server Action**: rejeitado — DDL em
  runtime é pattern frágil.

---

## Decisão 10 — `revalidateUserCache(userId)` helper

**Decision**: helper em [src/lib/cache.ts](../../src/lib/cache.ts):

```typescript
import { revalidateTag } from 'next/cache';

export function revalidateUserCache(userId: number): void {
  revalidateTag(`user:${userId}`);
}
```

Chamado no fim das Server Actions de write críticas — em
adição (não substituição) aos `revalidatePath` existentes.

**Rationale**:
- `revalidatePath` invalida cache da rota específica;
  `revalidateTag` invalida cache associado àquela tag, mesmo
  que esteja em outras rotas (ex: contadores que aparecem em
  múltiplas páginas).
- Combo é redundante mas defensivo. Custo: 0 reads extras —
  invalidation é metadata.

**Server Actions que chamam `revalidateUserCache`** (lista
inicial; ajustar conforme necessário):
- `updateRecordStatus` (Inc 11/19)
- `updateRecordAuthorFields` (Inc 21)
- `updateTrackCuration`
- `acknowledgeArchivedRecord`
- `acknowledgeAllArchived` (Inc 17)
- `acknowledgeImportProgress` (Inc 010)
- `analyzeTrackWithAI` / `updateTrackAiAnalysis` (Inc 13)
- `addTrackToSet` / `removeTrackFromSet` / `clearSet`
- `pickRandomUnratedRecord` é leitura — sem necessidade.

**Alternatives considered**:
- **Apenas `revalidatePath`**: rejeitado — alguns campos
  agregados (collectionCounts) aparecem em múltiplas rotas
  (footer da home + status); `revalidatePath` por rota não
  cobre todas combinações.

---

## Resumo

10 decisões resolvidas — sem NEEDS CLARIFICATION pendentes.
Phase 1 procede com:
- 1 contrato em `contracts/cache-wrappers.md` (especifica
  helper, integração query-by-query, migration SQL).
- 1 quickstart com cenários de validação manual + medição via
  dashboard Turso (antes/depois).
- Sem `data-model.md` (zero entidades; só índices).
