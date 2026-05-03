# Research — Search text materializado em records

**Phase**: 0
**Status**: complete
**Source**: diagnóstico via instrumentação `[DB]` em prod (sessão 2026-05-02 pós Inc 28) + decisões do mantenedor

## Decisões

### Decisão 1 — Coluna pre-normalizada em records (não FTS5, não index expression)

- **Decision**: adicionar coluna `records.search_text TEXT NOT NULL DEFAULT ''` que armazena `normalizeText(artist + ' ' + title + ' ' + (label ?? ''))`. Index `records(user_id, search_text)`.
- **Rationale**: Inc 18 (021) tomou caminho de filtro JS pós-query porque SQLite não tem `unaccent` nativo. A solução clean: pre-computar normalização ao escrever, indexar, usar `LIKE` em SQL. Mesma cobertura accent-insensitive (`normalizeText` já existe), mas paginação SQL volta a funcionar.
- **Alternatives considered**:
  - **FTS5 (Full-Text Search SQLite)**: virtual table dedicada, suporta tokenization custom (`unicode61` remove diacritics opcional). Mais poderoso (ranking, prefix queries). Mas: requer re-modelar consultas (`MATCH 'termo*'`), virtual table separada de `records`, sync mais complexo. Para escala atual (~2588 records/user) não compensa. **Reservar para Inc futuro** se LIKE virar gargalo a 10k+.
  - **Index expression** (`CREATE INDEX ON records(LOWER(artist))`): SQLite suporta expression indexes mas não tem função SQL pra remover diacríticos. Sem index expression, o LIKE seria sobre coluna não-indexada — full scan dentro do user. Coluna materializada resolve isso.
  - **Helper function via `db.run('SELECT lower(unaccent(?))', term)`**: SQLite/Turso não tem `unaccent`. Sem solução nativa.
  - **Manter status quo (Inc 18)**: queryCollection carrega 2588 rows + JS filter. Custo prohibitivo já confirmado em logs.

### Decisão 2 — Concatenação `artist + ' ' + title + ' ' + label`

- **Decision**: `search_text = normalizeText(artist + ' ' + title + ' ' + (label ?? ''))`. Espaços separadores entre campos. Label opcional (record sem label = string sem terceiro segmento).
- **Rationale**: cobre o uso atual (Inc 18 procurava em `[artist, title, label]`). Concatenação com espaço evita "merge" entre campos — busca por "joão miles" não casa contra "João Davis Miles" colapsado. Espaço pós-normalização preserva separação.
- **Alternatives considered**:
  - 3 colunas separadas (`artist_norm`, `title_norm`, `label_norm`): triplica writes/storage. Sem ganho em LIKE genérico. Descartado.
  - Inclusão de `genres`/`styles` (JSON arrays): hoje filtro multi-select usa equal-match em json_each (Inc 18 manteve assim), não text livre. Não atrapalha buscar por gênero como texto livre, mas custo de incluir = mais armazenamento. Descartado por enquanto; pode ser estendido em Inc futuro se DJ pedir busca textual em gênero/estilo.
  - Inclusão de `country`/`format`/`year`: sem demanda real. Manter mínimo.

### Decisão 3 — Não-nullable com default `''`

- **Decision**: coluna `NOT NULL DEFAULT ''`. Records antigos têm `''` até backfill. Ordem de deploy: migration → backfill → código novo.
- **Rationale**: simplifica queries (`LIKE '%termo%'` casa contra `''` retornando false trivialmente — não precisa COALESCE/null check). Backfill atualiza valores reais antes do código novo entrar em prod, evitando estado intermediário onde busca retornaria 0 falsos.
- **Alternatives considered**:
  - Nullable: queries precisam `COALESCE(search_text, '') LIKE ?`. Mais código, mais frágil.
  - Default vazio + backfill obrigatório no deploy: chosen path. Documentado em [tasks.md](./tasks.md) como ordem crítica.

### Decisão 4 — Hooks em `applyDiscogsUpdate` e `runInitialImport`

- **Decision**: 2 hooks de write. `applyDiscogsUpdate` (sync incremental) computa `search_text` ao montar payload de UPDATE/INSERT em records. `runInitialImport` (import inicial via Discogs) idem ao inserir cada record.
- **Rationale**: artist/title/label são campos zona SYS desde Inc 001 — apenas sync escreve. Não há writes pelo DJ direto nesses campos. 2 hooks cobrem 100% das mutações.
- **Implementation pattern**:
  ```ts
  import { computeRecordSearchText } from '@/lib/text';
  // dentro do payload de records.upsert ou records.insert:
  search_text: computeRecordSearchText(artist, title, label),
  ```
- **Alternatives considered**:
  - Trigger SQLite `BEFORE INSERT/UPDATE`: SQLite suporta, mas regra de negócio em SQL é menos visível e Princípio III prefere lógica em código TS. Descartado.
  - Hook centralizado em uma função `upsertRecord`: refator maior. Inc 32 mantém escopo enxuto — 2 callsites pontuais.
  - Cron noturno re-popular `search_text`: backup defensivo válido pra casos edge (mudança de algoritmo de normalização). **Adiciona ao cron diário** (ainda fora desta feature; se incluir, vira ~5min adicional).

### Decisão 5 — Helper `computeRecordSearchText(artist, title, label)`

- **Decision**: criar helper local em [src/lib/text.ts](../../src/lib/text.ts) que combina os 3 campos e chama `normalizeText`. Exportado como `computeRecordSearchText`. Mantém `normalizeText` existente intacto.
- **Rationale**: isolar a lógica de "como combinar os 3 campos" num único lugar. Sync e backfill usam mesma função, garantindo paridade. Mudança futura na composição (ex: incluir country) é 1 ponto de edição.
- **Pseudocódigo**:
  ```ts
  export function computeRecordSearchText(
    artist: string,
    title: string,
    label: string | null,
  ): string {
    return normalizeText([artist, title, label ?? ''].join(' '));
  }
  ```
- **Alternatives considered**: inline em cada hook. Duplicação. Descartado.

### Decisão 6 — Backfill via script Node único, idempotente

- **Decision**: criar `scripts/_backfill-search-text.mjs` (mesmo padrão Inc 24/27/28). Usa `DATABASE_URL`/`DATABASE_AUTH_TOKEN` env (ou file:./sulco.db local). Itera records, computa `search_text`, UPDATE. Idempotente (UPDATE setado mesmo se já igual — irrelevante).
- **Rationale**: padrão estabelecido nos Incs anteriores. Mantenedor já tem fluxo (turso shell migration → backfill → push). Custo: ~2588 reads (SELECT all records do user) + 2588 writes. 1× total.
- **Implementação enxuta**:
  ```js
  const rows = await db.execute({
    sql: 'SELECT id, artist, title, label FROM records',
    args: []
  });
  for (const r of rows.rows) {
    const searchText = normalize(`${r.artist} ${r.title} ${r.label ?? ''}`);
    await db.execute({
      sql: 'UPDATE records SET search_text = ? WHERE id = ?',
      args: [searchText, r.id]
    });
  }
  ```
  `normalize` é re-implementação inline da `normalizeText` (script Node não importa de TS facilmente sem build — duplicação aceita por ser script raro).
- **Alternatives considered**:
  - SQL puro com função custom Turso: Turso não tem extensions installable.
  - Server Action pra rodar backfill: quebra padrão de scripts manuais; preferível terminal isolado.

### Decisão 7 — Refator em `buildCollectionFilters` substitui pós-filtro JS

- **Decision**: em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts), refatorar `buildCollectionFilters`:
  - Remover flag `omitText` (passa a sempre incluir text filter no SQL quando há).
  - Text filter agora é `sql\`${records.search_text} LIKE \${ '%' + normalizeText(q.text) + '%' }\``.
  - Em `queryCollection`, remover branch condicional `hasTextFilter`/JS post-filter. Sempre paginação SQL.
- **Rationale**: SQL retorna conjunto correto e paginado. JS post-filter (`matchesNormalizedText`) não é mais necessário pra este caso. Código fica mais simples.
- **Pseudocódigo**:
  ```ts
  // Antes (Inc 18):
  if (!q.omitText && q.text.length > 0) {
    const pattern = `%${q.text.toLowerCase()}%`;
    conds.push(sql`(lower(${records.artist}) LIKE ${pattern} OR ...)`);
  }
  // ...
  // queryCollection branch hasTextFilter: carrega tudo, JS filter, JS slice

  // Depois (Inc 32):
  if (q.text.length > 0) {
    const normalized = normalizeText(q.text);
    conds.push(sql`${records.searchText} LIKE ${`%${normalized}%`}`);
  }
  // queryCollection: sempre SQL com LIMIT/OFFSET (sem branch condicional)
  ```
- **Alternatives considered**:
  - Manter `omitText` flag pra retrocompat: nenhum caller usa fora de `queryCollection`. Limpar.
  - Adicionar SQL FTS5 MATCH em vez de LIKE: ver Decisão 1.

### Decisão 8 — `pickRandomUnratedRecord` (Inc 11) beneficia automaticamente

- **Decision**: nenhuma mudança específica em `pickRandomUnratedRecord` em [src/lib/actions.ts](../../src/lib/actions.ts) — usa `buildCollectionFilters` que ganha SQL text filter via Decisão 7.
- **Rationale**: Inc 11 (botão 🎲) consume `buildCollectionFilters` e tem 2 paths (fast SQL `RANDOM() LIMIT 1` quando text vazio, slow JS post-filter quando text presente — Inc 18 deixou assim por causa accent). Pós-Inc 32, fast path serve mesmo com text filter (já que SQL agora filtra correto). Slow JS path pode ser removido junto.
- **Pseudocódigo de simplificação**:
  ```ts
  // Antes: condicional fast/slow
  if (hasTextFilter) {
    // slow: SELECT all + JS filter + JS random
  } else {
    // fast: ORDER BY RANDOM() LIMIT 1
  }
  // Depois: sempre fast (SQL com text filter já correto)
  return db.select(...).orderBy(sql`RANDOM()`).limit(1);
  ```
- **Considerar como sub-task explícita no `tasks.md`** pra não esquecer.

### Decisão 9 — `queryCandidates` em montar.ts fica fora desta feature

- **Decision**: NÃO refatorar `queryCandidates` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts). Continua usando JS post-filter pra text livre.
- **Rationale**: spec foca em records (gargalo confirmado em logs `/`). Tracks não foram identificadas como gargalo na mesma escala (LIMIT 1000 do Inc 23 mitiga). Adicionar `search_text` em tracks dobraria escopo + custo (10k tracks vs 2.5k records). Reservar para Inc futuro se virar gargalo.
- **Trade-off aceito**: busca textual em `/sets/[id]/montar` continua escaneando até 1000 tracks. Aceitável vs 2588 records de escaneamento na home.

### Decisão 10 — Não incluir Inc 32 no cron drift correction (por enquanto)

- **Decision**: cron diário (Inc 27) NÃO re-popular `search_text` periodicamente. Hooks em writes mantêm valor atualizado.
- **Rationale**: `search_text` é determinístico de campos imutáveis pelo DJ. Drift teórico só ocorre se algoritmo de normalização mudar, o que requer re-deploy + backfill manual mesmo. Cron noturno teria custo (full scan records pra cada user × N users). Não compensa.
- **Mitigação**: documentar em research.md que se `normalizeText` mudar no futuro, requer re-backfill manual + spec separada.

## Riscos identificados (e mitigações)

1. **Deploy out-of-order quebra busca**: código novo em prod sem migration ou sem backfill → busca casa contra `''` e retorna 0. Mitigação: tasks.md prescreve ordem (migration → backfill → push de código). Quickstart cobre verificação pós-backfill (rodar SQL conta records com `search_text=''`).

2. **Records criados após migration mas antes do backfill**: improvável (sync raro entre migration e backfill que rodam em ~5 min). Backfill é idempotente — re-run captura.

3. **Mudança no algoritmo de normalização**: futuro. Requer re-backfill manual + nova migration. Aceito (raríssimo).

4. **LIKE com `%termo%` não usa index full**: aceito; ganho ainda é massivo vs JS post-filter (transferir 2588 rows pra Lambda é o real custo). Inc futuro pode adicionar FTS5 se virar gargalo.

5. **Concurrent writes em sync que tocam mesmo record**: improvável. ON CONFLICT do INSERT em apply-update.ts já lida.

## Não-decisões (out of scope)

- `queryCandidates` em montar.ts — fica para Inc futuro.
- `tracks.search_text` — não é necessário pra Inc 32.
- FTS5 SQLite — Inc futuro se LIKE virar gargalo a 10k+ records/user.
- Cron drift correction de `search_text` — desnecessário (campo é determinístico).
- Busca textual em campos `genres`/`styles`/`country` — sem demanda atual.
- Drop colunas redundantes em `user_facets` — Inc 34 separado.
- Tabela `user_vocab` dedicada — Inc 33 separado.
