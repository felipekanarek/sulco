# Research — Inc 37 (034)

## Decision 1 — Ordem de implementação: Tier 3 → Tier 1 → Tier 2

**Decision**: implementar nesta ordem: Tier 3 (helpers puros) primeiro,
Tier 1 (Server Actions / AUTHOR proteção) depois, Tier 2 (equivalence
de otimizações) por último.

**Rationale**:
- Tier 3 valida o pattern Princípio VI com baixo custo (~1h, sem mocks
  complexos). 3 unit tests padronizam o template de header.
- Tier 1 é o **mais valioso** (proteção AUTHOR — Princípio I), mas
  exige `vi.doMock('@/lib/auth')` + fixture user. Vir depois de Tier 3
  permite reuso de helpers de seed (test-db) já refinados.
- Tier 2 (equivalence) é o **mais trabalhoso** (~3h) — depende de
  seed determinístico de 5+ records, mocks de `revalidateUserCache`,
  e cobertura por filtro distinto. Vem por último porque pode ser
  shipado em sub-feature 37b se tempo apertar.

**Alternatives considered**:
- **Tier 1 → Tier 3 → Tier 2**: priorizar valor imediato. Rejeitada
  porque mock pattern de Tier 1 é mais complexo; começar por ele
  arrisca pattern errado se descoberto algo no Tier 3.
- **Paralelo**: rejeitada por confundir review do PR e dificultar
  rollback se um tier expor bug.

---

## Decision 2 — Delivery monolítico (Inc 37) vs sub-features (37a/b/c)

**Decision**: **monolítico** — Inc 37 inteiro como 1 feature, 1 branch,
1 PR, 1 deploy.

**Rationale**:
- Estimativa total ~6-8h cabe em 1 sessão (similar a Inc 35 que foi
  ~5h consolidando 4 pivots em 1 release).
- Overhead de 3× speckit (specify + plan + tasks + analyze + implement)
  por sub-feature seria ~1.5h só de ritual — desproporcional.
- Inc 37 é puramente aditivo (testes), risco de rollback parcial é
  baixo. Princípio IV não toca curadoria.
- Histórico do projeto (Inc 23, 35) mostra que features grandes mas
  coesas funcionam melhor monolíticas.

**Alternatives considered**:
- **3 sub-features (37a/b/c)**: progresso incremental visível, mas
  custo de ritual 3× e overhead de 3 deploys/merges. Rejeitada.
- **2 sub-features (37a Tier 1+3, 37b Tier 2)**: Tier 2 é o
  trabalhoso e pode ficar pra depois. Considerada — fica como
  contingência se sessão estourar tempo.

---

## Decision 3 — Mock pattern uniforme

**Decision**: cada arquivo de teste integration novo adota o pattern:

```ts
beforeEach(async () => {
  ctx = await createTestDb();
  vi.doMock('@/db', () => ({ db: ctx.db }));
  vi.doMock('@/lib/auth', () => ({
    requireCurrentUser: async () => ({
      id: ctx.userId, // setado em seed
      clerkUserId: 'user_test_inc37',
      email: 'felipe@example.com',
      // outros campos default
    }),
    getCurrentUser: async () => ({ ... }),
  }));
  vi.doMock('@/lib/cache', () => ({
    cacheUser: <T extends (...a: any[]) => any>(fn: T) => fn,
    revalidateUserCache: vi.fn(), // spy pra asserts
  }));
});

afterEach(() => {
  vi.doUnmock('@/db');
  vi.doUnmock('@/lib/auth');
  vi.doUnmock('@/lib/cache');
  vi.resetModules();
  ctx.client.close();
});
```

**Rationale**: Clarification Q2=A. Pattern já validado em
`tests/integration/sync-preserves-author-fields.test.ts`. Zero
refator de código de produção (FR-007).

**Alternatives considered**:
- DI (Dependency Injection) — rejeitada Q2.
- Jest-style modules sem `vi.doMock` — não funciona com Next.js
  Server Actions.

---

## Decision 4 — Seed strategy pra equivalence tests (Tier 2)

**Decision**: helper compartilhado `seedCollectionFixture(db)` em
[tests/helpers/seed-collection.ts](../../tests/helpers/seed-collection.ts)
(NOVO) que cria 5 records com format/genre/style/year/country/label/
shelf distintos pra cobrir todos os filtros do `buildCollectionFilters`.

Schema do fixture:
| Record | Format | Genres | Styles | Year | Country | Label | Shelf |
|---|---|---|---|---|---|---|---|
| R1 | Vinyl, LP | Funk, Soul | AOR | 1985 | BR | Polydor | E1 |
| R2 | Vinyl, 7" | Rock | Punk | 1979 | UK | EMI | E2 |
| R3 | CD | Jazz | Bebop | 1995 | US | Blue Note | E1 |
| R4 | Vinyl, LP | Eletronic | House | 2010 | DE | Kompakt | E3 |
| R5 | Vinyl, 12" | Hip Hop | Boom Bap | 1992 | US | Def Jam | E2 |

Cada filtro retorna subset previsível (ex: `format=LP` → R1+R4,
`year=1985` → R1, `country=US` → R3+R5).

**Rationale**: 5 records balanceiam cobertura sem inflar suite. Cada
`it()` em `buildCollectionFilters.test.ts` reusa o seed.

**Alternatives considered**:
- Seed por test (1 record por it) — repetição massiva. Rejeitada.
- Seed grande (50+ records) — slow tests. Rejeitada.

---

## Decision 5 — Coverage tooling: @vitest/coverage-v8

**Decision** (Clarification Q1=A): instalar `@vitest/coverage-v8` como
devDependency, adicionar script `test:coverage` ao package.json,
gerar baseline em `specs/034-retroactive-test-coverage/coverage-baseline.md`.

**Rationale**: Q1=A confirmado. v8 é provider built-in, sem
overhead de Babel/instrument. Compatível com Vitest 2.x já em uso.

**Config básica** (vitest.config.ts):
```ts
test: {
  ...,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'json-summary'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/db/seed.ts', 'src/app/**'],
  },
},
```

Baseline gerado **após** Tier 3+1+2 completos pra refletir cobertura
final, não inicial.

**Alternatives considered**:
- `@vitest/coverage-istanbul`: instrumentação Babel, ~30% mais lento.
  Rejeitada.
- Sem coverage tooling (deferir Inc 38): rejeitada por Q1=A.

---

## Decision 6 — Threshold gate diferido pra Inc 38

**Decision**: NÃO configurar `coverage.thresholds` em vitest.config.ts
durante Inc 37. Apenas registrar baseline.

**Rationale**: Inc 37 estabelece linha de base; Inc 38 (futuro) pode
configurar threshold (ex: "≥70% linha em src/lib/queries/**") como
gate de CI. Princípio: **medir antes de enforce**.

**Alternatives considered**:
- Configurar threshold já em Inc 37: prematuro — não temos baseline
  pra calibrar. Pode fazer CI gate falhar incorretamente.

---

## Decision 7 — Localização do baseline + threshold doc

**Decision**: artefato `coverage-baseline.md` na raiz da feature
(`specs/034-retroactive-test-coverage/coverage-baseline.md`) gerado
manualmente após `npm run test:coverage` retornar JSON. Contém tabela
% linha + branch + funções por arquivo crítico.

**Rationale**: artefato versionado em git, comparável em PRs futuros.
Localização dentro de specs/ reflete que é output desta feature.

**Alternatives considered**:
- `BACKLOG.md` entry: poluiria backlog. Rejeitada.
- `coverage/` raw output: não-versionado (gitignored). Rejeitada.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Teste expõe bug genuíno em produção | FR-007: criar entry em BACKLOG (Bug N) + fix + regression test. Bug doesn't block merge se isolado. |
| `vi.doMock` race condition entre describes | `beforeEach`/`afterEach` resetam módulos via `vi.resetModules()`. Pattern sync-preserves-author-fields validado. |
| test-db.ts evolui durante Inc 37 | Atualização documentada em commit separado. Roda full suite após cada change. |
| Sessão estoura ~8h | Contingência: shipar Tier 1+3 como Inc 37 e adiar Tier 2 pra Inc 37b sub-feature. |
| Coverage baseline difícil de interpretar | Markdown table com % por arquivo + comentário "área não-coberta justificada por X". |

---

## Open Questions

Nenhuma. Q1 e Q2 do prompt original resolvidas no /speckit.clarify.
