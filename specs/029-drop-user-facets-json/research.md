# Research — Inc 34 / 029: Drop colunas `*Json` em `user_facets`

**Phase**: 0
**Status**: low-risk cleanup. Decisões são curtas e já pré-acordadas.

## Decisão 1 — Code deploy ANTES de migration

**Decisão**: deploy de código primeiro; depois `ALTER TABLE DROP COLUMN` × 5.

**Rationale**:
- Código novo não lê as colunas (`getUserFacets` enxugado, sem `parseJsonArray(row.genresJson, ...)`). Tabela velha tem colunas extras que são ignoradas por Drizzle (SELECT só pega campos enumerados no schema TS).
- Inversão (migration antes de deploy) significa: código velho em prod ainda referencia `row.genresJson`, e essa coluna deixa de existir no banco. Drizzle pode retornar undefined → `parseJsonArray` retorna fallback `[]` → pickers vazios temporariamente.
- Code-first elimina o problema. Janela curta (segundos) entre deploy e migration é tolerável; nesse intervalo, código novo escreve em INSERT/onConflictDoUpdate sem os 5 campos JSON, mas o banco velho aceita (campos preservam default `[]` antigo). Sem erro.

**Alternativas consideradas**:
- **Migration antes de deploy**: rejeitado pelos motivos acima.
- **Deploy + migration atômicos**: impossível em Vercel Hobby (deploy + DDL externos).
- **Manter colunas com `optional` + null**: rejeitado — não soluciona, só posterga.

## Decisão 2 — `ALTER TABLE DROP COLUMN` × 5 vs. recriar tabela

**Decisão**: 5 ALTER TABLE DROP COLUMN sequenciais.

**Rationale**:
- SQLite ≥3.35 (e libsql moderno) suporta nativamente. Sem necessidade de recriar tabela com CREATE TABLE new + INSERT SELECT + DROP old.
- Mais simples, atômico por coluna, reversível (revert + ADD COLUMN também simples).
- Turso CLI executa cada statement separadamente — se um falhar, demais ainda rodam (mas idealmente 5 sucessos seguidos).

**Alternativas consideradas**:
- **Recriar tabela**: rejeitado — complica reversão, precisa salvar dados.
- **DROP TABLE + CREATE TABLE**: rejeitado — perde counters e timestamp (que são preservados).

## Decisão 3 — Helpers `aggregateFacet`/`aggregateVocabulary`/`aggregateShelves` removidos

**Decisão**: deletar os 3 helpers privados em `src/lib/queries/user-facets.ts` (~80 LoC).

**Rationale**:
- Pós-Inc 34, ninguém alimenta as colunas JSON. Esses 3 helpers eram chamados exclusivamente em `recomputeFacets` para popular `genresJson`/`stylesJson`/`moodsJson`/`contextsJson`/`shelvesJson`.
- Inc 33 introduziu `_aggregateVocabCounts` e `_aggregateShelfCounts` (com `count`) que substituem funcionalmente — usados em `_repopulateVocab` para popular `user_vocab` (com `ref_count`).
- Manter os 3 helpers seria dead code permanente.

**Alternativas consideradas**:
- **Manter helpers como utility**: rejeitado — sem callers, geram ruído ao ler o módulo.
- **Refatorar pra unificar com `_aggregateVocabCounts`**: já é o caso (Inc 33 substituiu). Apenas deletar.

## Decisão 4 — `parseJsonArray` permanece se ainda usado em outro lugar

**Decisão**: verificar via grep antes de remover.

**Rationale**:
- `parseJsonArray<T>(s, fallback)` foi escrito originalmente pra parsing de JSON columns em `user_facets`. Pode ser usado em outros lugares se algum migration intermediário deixou de usar mas não removeu o helper.
- Custo de manter um helper trivial é zero; custo de remover acidentalmente algo usado é breakage.

**Implementação**: `grep -rn "parseJsonArray" src/` antes de mexer no helper. Se zero callers além de `getUserFacets`, remover. Se outros, manter.

**Alternativas consideradas**:
- **Remover sempre**: rejeitado — risco baixo mas evitável.

## Decisão 5 — Deletar arquivo de helpers privados ou só os 3 dentro

**Decisão**: deletar apenas as 3 funções privadas + manter o arquivo `user-facets.ts` (que continua exportando `getUserFacets`, `recomputeFacets`, `applyRecordStatusDelta`, `applyTrackSelectedDelta`, `applyDeltaForWrite`, `_repopulateVocab` e privados Inc 33).

**Rationale**: arquivo continua sendo o módulo de queries de `user_facets` + `_repopulateVocab` para `user_vocab`. Não há motivo pra dividir.

## Decisão 6 — Sem testes automatizados

**Decisão**: validação manual via quickstart pós-deploy. Mesmo padrão de todas as features anteriores (sem suite de testes automatizados em Sulco).

**Rationale**: cleanup é low-risk + smoke manual cobre todas as garantias materiais (build OK + funcionalidade preservada + recomputeFacets funciona).

## Decisão 7 — Reversibilidade

**Plan**:
- `git revert` do commit do Inc 34 + push.
- `turso db shell sulco-prod` aplicando 5 ALTER TABLE ADD COLUMN com defaults vazios:
  ```sql
  ALTER TABLE user_facets ADD COLUMN genres_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE user_facets ADD COLUMN styles_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE user_facets ADD COLUMN moods_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE user_facets ADD COLUMN contexts_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE user_facets ADD COLUMN shelves_json TEXT NOT NULL DEFAULT '[]';
  ```
- Próximo `recomputeFacets` re-popularia as colunas (com lógica antiga). Listas ficariam como fallback novamente.

**Custo de reversão**: ~5min total. Aceitável.

## Resumo de decisões

| # | Decisão | Motivo principal |
|---|---|---|
| 1 | Code deploy antes de migration | Evita janela onde código velho lê coluna inexistente |
| 2 | DROP COLUMN nativo × 5 | Suportado pelo libsql moderno; reversível |
| 3 | Deletar 3 helpers privados | Dead code post-Inc 33 |
| 4 | `parseJsonArray` condicional | Verificar callers antes de remover |
| 5 | Manter arquivo, deletar funções | Módulo continua coerente |
| 6 | Smoke manual via quickstart | Padrão Sulco |
| 7 | Reversão simples | revert + ADD COLUMN × 5 |
