# Quickstart — Inc 37 (034)

Validação manual em 4 cenários. Tudo local — feature não toca prod.

## Pré-validação

1. Branch checkout:
   ```bash
   git checkout 034-retroactive-test-coverage
   ```
2. Deps atualizadas:
   ```bash
   npm install  # @vitest/coverage-v8 entrou em devDeps
   ```
3. Build verde:
   ```bash
   npm run build
   ```

---

## Cenário 1 — Suíte total verde (US4 — Princípio VI bullet 7)

```bash
npm run test
```

**Sucesso**:
- Exit code 0.
- ≥194 testes passing (164 antes + ≥30 novos).
- 0 failing.
- ≥37 todo (preservado).
- Mensagem `Test Files: ≥35 passed (≥35)` no resumo final.

---

## Cenário 2 — Tier 3 unit verifica helpers puros (US1)

```bash
npx vitest run tests/unit/normalize-text.test.ts tests/unit/compute-record-search-text.test.ts tests/unit/diff-vocab-arrays.test.ts
```

**Sucesso**:
- ≥30 cases passing.
- Cobertura de diacríticos pt-BR (`São Paulo` → `sao paulo`,
  `naïve`/`naive`, `garcon`/`garçon`).
- Edge cases: empty, null/undefined, whitespace, unicode raro.
- `diffVocabArrays` cobre dedup + ordem preservada.

---

## Cenário 3 — Tier 1 integration valida AUTHOR proteção (US2)

```bash
npx vitest run tests/integration/sync-preserves-author-fields.test.ts \
  tests/integration/archive-record-author-preserved.test.ts \
  tests/integration/delete-set-preserves-tracks.test.ts \
  tests/integration/update-record-status.test.ts \
  tests/integration/update-record-author-fields.test.ts \
  tests/integration/update-track-curation.test.ts
```

**Sucesso**:
- ≥18 cases passing.
- Cada teste cobre: caminho feliz + ownership-fail (user errado) +
  Zod validation rejection + AUTHOR preservation.
- `sync-preserves-author-fields` estendido cobre pivots Inc 35.

**Smoke de regressão simulada (SC-006)**:

1. Comentar uma proteção AUTHOR em
   [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts)
   (ex: remover linha que mantém `status` no UPDATE):
2. Rodar `npm run test:constitution`.
3. Verificar que pelo menos 1 teste falha.
4. **Reverter mudança**.

---

## Cenário 4 — Tier 2 integration valida equivalence (US3)

```bash
npx vitest run tests/integration/buildCollectionFilters.test.ts \
  tests/integration/applyVocabDelta.test.ts \
  tests/integration/applyPivotDelta.test.ts \
  tests/integration/cache-user.test.ts
```

**Sucesso**:
- ≥30 cases passing.
- Cada filtro do `buildCollectionFilters` (status, text, genres,
  styles, formats, year, country, label, shelf, bomba) tem 1 it()
  cobrindo subset retornado.
- `applyVocabDelta`: UPSERT increment + DELETE clamp + idempotência
  (re-execução com mesmos args produz mesmo estado).
- `applyPivotDelta`: INSERT batched + DELETE seletivo + filtro
  empty/whitespace.
- `cache-user`: cache key composto + tag invalidation isolation.

---

## Cenário 5 — Coverage baseline (FR-009)

```bash
npm run test:coverage
```

**Sucesso**:
- Suíte roda + gera `coverage/` (gitignored) + `coverage/coverage-summary.json`.
- Output texto na console mostra % linha/branch/funções por arquivo.
- Felipe ou Claude geram **manualmente**
  `specs/034-retroactive-test-coverage/coverage-baseline.md` com
  números refletidos do JSON.

**Comparação esperada com data-model.md** (alvo):

| Arquivo | % linha alvo |
|---|---|
| `src/lib/text.ts` | 100% |
| `src/lib/format-tokens.ts` | 100% |
| `src/lib/pivot-helpers.ts` | 100% |
| `src/lib/queries/user-vocab.ts` | ≥80% |
| `src/lib/cache.ts` | ≥70% |
| `src/lib/queries/collection.ts` | ≥60% |
| `src/lib/discogs/apply-update.ts` | ≥80% |
| `src/lib/discogs/archive.ts` | ≥90% |

---

## Cenário 6 — Princípio II preservado

```bash
git diff main -- src/
```

**Sucesso**: zero linhas removidas/modificadas em `src/lib/`,
`src/app/`, `src/components/`. Apenas adições (NOVO arquivo
`src/lib/format-tokens.ts` veio do Inc 36 — não conta). Inc 37 deve
mostrar diff vazio em `src/`.

(Exceção: caso teste exponha bug genuíno → fix + regression test no
mesmo PR com link pra issue, FR-007.)

---

## Métricas-chave esperadas (pós-Inc 37)

| Métrica | Antes (pós-Inc 36) | Depois (pós-Inc 37) |
|---|---|---|
| Total tests passing | 164 | ≥194 |
| Test files | 28 | ≥35 |
| Coverage tooling | Inexistente | `@vitest/coverage-v8` config + script |
| Coverage baseline | Não-medido | Documentado em `coverage-baseline.md` |
| Server Actions com integration test direto | 1 (apply-update via sync gate) | 7+ (5 críticas + archive + delete) |
| Helpers puros com unit test | 1 (`tokenizeFormat`) | 4 (+ normalize-text, compute-record-search-text, diff-vocab-arrays) |
| Pivot helpers com test direto | 1 (record_formats indireto) | 2 (`applyPivotDelta` direto) |
| Cache layer com test | 0 | 1 (`cacheUser` + `revalidateUserCache`) |
