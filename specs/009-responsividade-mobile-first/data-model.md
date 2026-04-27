# Phase 1 — Data Model: Responsividade mobile-first (009)

**Data**: 2026-04-26
**Referência de schema**: `src/db/schema.ts`

---

## Delta de schema

**Nenhum.** Inc 009 é puramente front-end. Zero colunas adicionadas,
zero entities novos, zero migrações.

---

## Entities consumidos (read-only)

Todas as entidades existentes continuam sendo lidas pelas mesmas queries
(loadDisc, queryCandidates, queryCollection, listSets, getImportProgress
etc.). Sem mudança nos shapes de retorno.

| Entity | Origem | Uso em 009 |
|---|---|---|
| `records` | tabela atual | exibido em coleção `/`, banner `/disco/[id]`, listSets |
| `tracks` | tabela atual | exibido em `<TrackCurationRow>`, `<CandidateRow>` |
| `sets` | tabela atual | exibido em `/sets`, `/sets/[id]`, `/sets/[id]/montar` |
| `setTracks` | tabela atual | derivado em physical bag |
| `users` | tabela atual | identidade DJ (Clerk) |
| `syncRuns` | tabela atual | banner ImportProgress, badge SyncBadge |

---

## Estado UI (client-side, sem persistência)

Inc 009 introduz estado de UI puramente local — não persiste em
banco nem em URL/cookie. Reset no reload é aceitável (idêntico ao
"compact/expand per-card" do 003).

| Estado | Localização | Reset em |
|---|---|---|
| `drawerOpen` (nav lateral) | `<MobileNavTrigger>` ou layout root | reload, navegação |
| `sheetOpen` (filtros) | parent page (`/sets/[id]/montar` ou `/`) | reload, navegação, "Aplicar" |
| `filterDraft` (filtros antes de aplicar) | parent page | "Aplicar" promove pra URL searchParams (estado já existente) |
| Foco salvo antes de abrir drawer | `<MobileDrawer>` interno | close |

**Nota**: `montarFiltersJson` (003, persistido em DB) continua sendo
a fonte da verdade pra filtros aplicados; o sheet é só uma UI nova
pra editar esse estado em mobile.

---

## Princípio I — campos protegidos

Não aplicável diretamente — Inc 009 não escreve. Mas vale registro:
**a refatoração visual NÃO MUST tocar nas Server Actions** que
gravam campos AUTHOR (updateTrackCuration, updateRecordStatus etc.).
Tudo passa só por rendering changes.

---

## Invariantes (testes explícitos)

| Invariante | Teste |
|---|---|
| Estado `drawerOpen=true` trava body scroll | `mobile-drawer-state.test.tsx`: simula open, confirma `body.style.overflow === 'hidden'` |
| ESC fecha drawer aberto | mesmo arquivo: dispara `keydown` com `key='Escape'`, confirma close |
| Tap fora (overlay) fecha drawer | mesmo arquivo: simula click no overlay, confirma close |
| Filter sheet "Aplicar" promove draft pra URL searchParams | e2e cobre indiretamente (filtros aplicados aparecem na lista) |
| Sem scroll horizontal em viewport 375px | e2e mobile spec checa `document.documentElement.scrollWidth <= window.innerWidth` |
