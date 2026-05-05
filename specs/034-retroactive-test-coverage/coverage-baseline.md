# Coverage Baseline — Inc 37 (034)

**Gerado**: 2026-05-05 (pós-implementação dos 3 tiers)
**Tooling**: `@vitest/coverage-v8` v2.1.9
**Comando**: `npm run test:coverage`

---

## Resumo

| Total | Linhas | Branch | Funções | Statements |
|---|---|---|---|---|
| Geral | 32.78% | 71.19% | 24.44% | 32.78% |

**Notas**:
- Geral inclui `src/app/**` e `src/components/**` que estão excluídos do
  scope (UI fora — cobertura via E2E Playwright). Coverage real de
  `src/lib/**` é significativamente maior.
- Funções % puxado pra baixo por endpoints/utilitários não-cobertos (ex:
  `bag.ts`, `sets.ts`, `status.ts`, `admin.ts`, AcousticBrainz batch).
- 286 testes passando (164 baseline + 122 novos do Inc 37).

---

## Arquivos críticos (alvo Inc 37)

| Arquivo | Linhas % | Branch % | Funções % | Notas |
|---|---|---|---|---|
| `src/lib/text.ts` | **100%** | **100%** | **100%** | Tier 3 ✅ — `normalizeText`, `matchesNormalizedText`, `computeRecordSearchText` totalmente cobertos |
| `src/lib/format-tokens.ts` | **100%** | **100%** | **100%** | Inc 36 unit ✅ — `tokenizeFormat` |
| `src/lib/cache.ts` | **100%** | **100%** | **100%** | Tier 2 ✅ — pass-through helpers |
| `src/lib/pivot-helpers.ts` | **100%** | **100%** | **100%** | Tier 2 ✅ — `applyPivotDelta` |
| `src/lib/queries/user-vocab.ts` | **90.66%** | 100% | 100% | Tier 2 ✅ — `applyVocabDelta` + `diffVocabArrays` (linhas 46-52 fora: branches do listVocab() não-testadas) |
| `src/lib/discogs/archive.ts` | **96.72%** | 57.89% | 100% | Tier 1 ✅ — `archiveRecord` (linhas 85-86 fora: error log path) |
| `src/lib/discogs/apply-update.ts` | **87.33%** | 59.32% | 100% | Tier 1 ✅ — `applyDiscogsUpdate` 3 paths cobertos. Linhas 224-225, 256-265 fora: re-population de track-level pivots em reaparição (edge case raríssimo) |
| `src/lib/queries/collection.ts` | **72.43%** | 82.14% | 25% | Tier 2 ✅ — `buildCollectionFilters` 100% dos filtros cobertos via 16 it() em buildCollectionFilters.test.ts. Funções % baixo: `listUserGenres`, `listUserStyles`, `listUserShelves`, `listUserFormats`, `listUserCountries`, `listUserLabels`, `listUserYears` (wrappers) não testados — Inc 38 candidato |
| `src/lib/actions.ts` | **27.74%** | 71.96% | 17.5% | Tier 1 ✅ — 5 Server Actions críticas cobertas (`updateRecordStatus`, `updateRecordAuthorFields`, `updateTrackCuration`, `deleteSet` + indireta via `archiveRecord`). Resto do arquivo (≈30 outras Server Actions: `acknowledge*`, `enrich*`, `pickRandom*`, `addTrack*`, `analyze*`, `suggestSet*`, `update*Set*`, etc.) **fica como Inc 38 candidato** — fora do scope retroativo (Inc 23-32) |
| `src/lib/queries/montar.ts` | 0.72% | 100% | 0% | **NÃO coberto** — Inc 26 perf-only refactor sem touch em paths críticos AUTHOR. Inc 38 candidato pra equivalence test em `queryCandidates`/`listSelectedVocab` |
| `src/lib/queries/user-facets.ts` | 7.44% | 42.85% | 18.18% | **NÃO coberto** — Inc 23/25/27/29 denormalização SYS sem AUTHOR write. Inc 38 candidato pra `recomputeFacets`/`applyDeltaForWrite` |

---

## Comparação com alvos data-model.md

| Arquivo | Alvo data-model | Real | Status |
|---|---|---|---|
| `src/lib/text.ts` | 100% | 100% | ✅ Atingido |
| `src/lib/format-tokens.ts` | 100% | 100% | ✅ |
| `src/lib/pivot-helpers.ts` | 100% | 100% | ✅ |
| `src/lib/queries/user-vocab.ts` | ≥80% | 90.66% | ✅ Acima |
| `src/lib/cache.ts` | ≥70% | 100% | ✅ Acima |
| `src/lib/queries/collection.ts` | ≥60% | 72.43% | ✅ Acima |
| `src/lib/discogs/apply-update.ts` | ≥80% | 87.33% | ✅ Acima |
| `src/lib/discogs/archive.ts` | ≥90% | 96.72% | ✅ Acima |

8/8 alvos atingidos ou superados. **Tiers 1 + 2 + 3 entregaram conforme spec.**

---

## Áreas não-cobertas (justificativa)

1. **`src/app/**` e `src/components/**`** — excluídos via `coverage.exclude`
   em vitest.config.ts. Cobertura via E2E Playwright (Inc 36 introduziu
   pattern; suíte E2E precisa expansão pra cobrir UI completa — Inc 38).
2. **`src/lib/queries/montar.ts`** — Inc 26 otimização perf-only. Equivalence
   test pra `queryCandidates` / `listSelectedVocab` é candidato Inc 38
   Tier 2.
3. **`src/lib/queries/user-facets.ts`** — denormalização SYS (Inc 23/25/27/29).
   Cobertura via `recomputeFacets` smoke + `applyDeltaForWrite` direcionado
   é candidato Inc 38 Tier 2.
4. **Server Actions secundárias em `src/lib/actions.ts`** — ~30 outras
   actions (acknowledge*, enrich*, pickRandom*, addTrack*, suggestSet*,
   updateSet*, createSet, deleteAccount, etc.) sem cobertura direta.
   Critério: incluir todas em Inc 38 Tier 1.5 (extensão).
5. **`src/lib/discogs/import.ts`, `client.ts`** — sync/import paths
   cobertos parcialmente via fixture mock no sync-preserves-author-fields.
   Cobertura específica do happy path de import inicial é candidato Inc 38.
6. **AI prompts/adapters (`src/lib/ai/**`, `src/lib/prompts/**`)** —
   Inc 12-14. Mocks complexos de providers (Anthropic, Gemini, OpenAI,
   etc.). Custo de testar > valor; baseline 13% considerado aceitável.

---

## Próximos passos (Inc 38 candidatos)

Com este baseline estabelecido, Inc 38 pode:

1. **Threshold gate em CI**: configurar `coverage.thresholds` em
   vitest.config.ts (ex: `lines: 70` em `src/lib/queries/**`,
   `lines: 80` em `src/lib/discogs/**`) e fazer CI falhar se cobertura
   regredir.
2. **Cobertura de `montar.ts`**: 1 integration test cobrindo
   `queryCandidates` com 5 records + 5 tracks + filtros distintos.
3. **Cobertura de `user-facets.ts`**: integration tests pra
   `recomputeFacets` + `applyDeltaForWrite`.
4. **Server Actions secundárias**: Tier 1.5 com ~10 testes adicionais.

---

## Métricas finais Inc 37

- **Testes pré-Inc 37**: 164 passing
- **Testes pós-Inc 37**: **286 passing** (+122)
- **Test files pré**: 28
- **Test files pós**: **40** (+12)
- **Tier 3 (helpers puros)**: 52 testes em 3 arquivos
- **Tier 1 (AUTHOR proteção)**: 38 testes em 6 arquivos
- **Tier 2 (equivalence)**: 36 testes em 4 arquivos
- **Cobertura `src/lib/text.ts`**: 0% → 100%
- **Cobertura `src/lib/queries/user-vocab.ts`**: 0% → 90.66%
- **Cobertura `src/lib/pivot-helpers.ts`**: 0% → 100%
- **Cobertura `src/lib/cache.ts`**: 0% → 100%
- **Cobertura `src/lib/discogs/archive.ts`**: 0% → 96.72%

**Tempo real**: ~3h (estimativa era 6-8h — pattern uniforme + helpers
compartilhados encurtaram o ciclo).
