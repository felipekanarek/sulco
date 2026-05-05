# Data Model — Inc 37 (034)

## Schema delta

**Zero schema delta**. Feature toca apenas testes. Banco e código de
produção ficam intactos.

## Test fixture (NOVO helper)

[tests/helpers/seed-collection.ts](../../tests/helpers/seed-collection.ts)
exporta `seedCollectionFixture(db)` que cria:

### Users

| ID interno | clerk_user_id | email | discogs_username |
|---|---|---|---|
| u1 | user_test_owner | felipe@example.com | felipekanarek |
| u2 | user_test_other | other@example.com | other |

`u2` usado em testes de ownership-fail (cenário "user errado tenta
modificar record do u1").

### Records (do u1)

| ID | discogs_id | artist | title | year | label | country | format | genres | styles | shelf | status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| r1 | 1001 | A1 | T1 | 1985 | Polydor | BR | Vinyl, LP | Funk, Soul | AOR | E1 | active |
| r2 | 1002 | A2 | T2 | 1979 | EMI | UK | Vinyl, 7" | Rock | Punk | E2 | unrated |
| r3 | 1003 | A3 | T3 | 1995 | Blue Note | US | CD | Jazz | Bebop | E1 | active |
| r4 | 1004 | A4 | T4 | 2010 | Kompakt | DE | Vinyl, LP | Eletronic | House | E3 | discarded |
| r5 | 1005 | A5 | T5 | 1992 | Def Jam | US | Vinyl, 12" | Hip Hop | Boom Bap | E2 | active |

### Tracks (1 por record, A1)

| record_id | position | title | selected | bpm | musical_key | energy | rating | moods | contexts | is_bomb |
|---|---|---|---|---|---|---|---|---|---|---|
| r1 | A1 | tk1 | true | 120 | 8A | 4 | 3 | solar, festivo | pico | true |
| r2 | A1 | tk2 | true | 145 | 4A | 5 | 2 | agressivo | fechamento | false |
| r3 | A1 | tk3 | false | 90 | 12A | 2 | null | calmo | abertura | false |
| r4 | A1 | tk4 | true | 128 | 6A | 5 | 3 | hipnótico | pico | false |
| r5 | A1 | tk5 | true | 95 | 10A | 3 | 1 | bruto | meio | false |

### Pivots populados (Inc 35 + Inc 36)

- `record_genres`: 6 entries (R1×2, R2, R3, R4, R5)
- `record_styles`: 5 entries (1 por R)
- `record_formats`: 13 entries (R1: Vinyl+LP, R2: Vinyl+7", R3: CD,
  R4: Vinyl+LP, R5: Vinyl+12")
- `track_moods`: 6 entries (R1×2 moods, R2, R3, R4, R5)
- `track_contexts`: 5 entries (1 por track)

### Sets (do u1)

| ID | name | event_date |
|---|---|---|
| s1 | Set teste | 2026-06-01 |

`set_tracks`: 3 rows ligando s1 ↔ tk1, tk2, tk5.

### user_facets (do u1)

| records_total | records_active | records_unrated | records_discarded | tracks_selected_total |
|---|---|---|---|---|
| 5 | 3 | 1 | 1 | 4 |

### user_vocab (do u1)

Entries derivadas dos records (kind=genres, styles, formats,
countries, labels, shelves, moods, contexts) com ref_count
calculado.

---

## Coverage baseline (artefato, NOVO)

[coverage-baseline.md](./coverage-baseline.md) (gerado pós-Tier 2)
contém:

```markdown
# Coverage Baseline — Inc 37 (034) — 2026-05-05

| Arquivo | Linha % | Branch % | Funções % | Notas |
|---|---|---|---|---|
| src/lib/format-tokens.ts | 100% | 100% | 100% | Cobertura unit Inc 36 |
| src/lib/text.ts | 100% | 95%+ | 100% | Tier 3 — normalize-text + compute-record-search-text |
| src/lib/queries/user-vocab.ts | 80%+ | 70%+ | 100% | Tier 2 — applyVocabDelta + diffVocabArrays |
| src/lib/pivot-helpers.ts | 100% | 100% | 100% | Tier 2 — applyPivotDelta |
| src/lib/cache.ts | 70%+ | 50%+ | 100% | Tier 2 — cacheUser + revalidateUserCache |
| src/lib/queries/collection.ts | 60%+ | 50%+ | 80%+ | Tier 2 — buildCollectionFilters cobre 9 filtros |
| src/lib/discogs/apply-update.ts | 80%+ | 70%+ | 100% | Tier 1 — sync + 3 paths |
| src/lib/discogs/archive.ts | 90%+ | 80%+ | 100% | Tier 1 — preservação AUTHOR |
| src/lib/actions.ts (parcial) | 30%+ | 20%+ | 40%+ | Tier 1 — 5 Server Actions críticas; restante fora de escopo |
```

Numeros exatos preenchidos após `npm run test:coverage` real.
Threshold gate (Inc 38) provavelmente vai exigir ≥70% linha em
arquivos críticos.

---

## Test files (entrada do Inc 37)

### Tier 3 — Unit

| Arquivo | Cases (alvo) | Função sob teste |
|---|---|---|
| `tests/unit/normalize-text.test.ts` | ~12 | `normalizeText` (Inc 18) |
| `tests/unit/compute-record-search-text.test.ts` | ~8 | `computeRecordSearchText` (Inc 32) |
| `tests/unit/diff-vocab-arrays.test.ts` | ~10 | `diffVocabArrays` (Inc 33) |

### Tier 1 — Integration (AUTHOR proteção)

| Arquivo | Cases (alvo) | Função sob teste |
|---|---|---|
| `tests/integration/sync-preserves-author-fields.test.ts` (estendido) | +6 | apply-update.ts pivots Inc 35 |
| `tests/integration/archive-record-author-preserved.test.ts` | ~6 | `archiveRecord` |
| `tests/integration/delete-set-preserves-tracks.test.ts` | ~5 | `deleteSet` (Inc 30) |
| `tests/integration/update-record-status.test.ts` | ~5 | Server Action (Princípio I) |
| `tests/integration/update-record-author-fields.test.ts` | ~5 | Server Action |
| `tests/integration/update-track-curation.test.ts` | ~7 | Server Action |

### Tier 2 — Integration (equivalence)

| Arquivo | Cases (alvo) | Função sob teste |
|---|---|---|
| `tests/integration/buildCollectionFilters.test.ts` | ~10 | 1 it() por filtro |
| `tests/integration/applyVocabDelta.test.ts` | ~7 | Inc 33 |
| `tests/integration/applyPivotDelta.test.ts` | ~7 | Inc 35 |
| `tests/integration/cache-user.test.ts` | ~5 | Inc 23 |

**Total alvo**: ~30 unit + ~30 integration = ~60 testes novos. Mínimo
SC-001: 30. Provável final: 50-60.

---

## Princípios

| Princípio | Status | Notas |
|---|---|---|
| I — Soberania DJ | ✅ | Tier 1 valida AUTHOR não-overwrite |
| II — Server-First | ✅ | Sem RSC novo; Server Actions intactas |
| III — Schema verdade | ✅ | Zero schema delta |
| IV — Preservar | ✅ | Tier 1 cobre archive+delete |
| V — Mobile-Native | N/A | Sem UI |
| VI — Cobertura | ✅ | **Esta feature É a aplicação retroativa** |
