# CLAUDE.md — Sulco

Guia de contexto para o Claude Code. Leia este arquivo inteiro antes de qualquer ação.

---

## Convenções

### Sobre este arquivo

CLAUDE.md contém apenas conhecimento **estável** + markers do agente:
arquitetura, modelo de dados, padrões de código, regras de negócio
críticas (Princípio I etc.), histórico de decisões com semver, e
SPECKIT START/END markers.

**NÃO entra aqui**: roadmap, bugs abertos, features pendentes, ideias
não-comprometidas. Tudo isso vive em [BACKLOG.md](./BACKLOG.md).

**Releases entregues** ficam registradas em `BACKLOG.md > Releases` com
ref pra `specs/NNN-feature/`. Incrementos concluídos NÃO deixam
rastro inline aqui.

### Sobre o processo de desenvolvimento (Spec Kit)

**Toda mudança — bug, fix, incremento pequeno ou grande — DEVE passar
pelo Spec Kit.** Sem exceção por "tamanho percebido".

Comandos obrigatórios em ordem:
1. `/speckit.specify` — cria branch + spec mínima
2. `/speckit.clarify` — opcional, só pra ambiguidades reais
3. `/speckit.plan` — design técnico
4. `/speckit.tasks` — breakdown executável
5. `/speckit.analyze` — cross-check spec/plan/tasks (recomendado pra
   incrementos médios+)
6. `/speckit.implement` — execução com checkpoints

**Por quê obrigatório**: rastreabilidade. Cada decisão fica versionada
em `specs/NNN-*/` (spec, plan, tasks, contracts). Commits referenciam
spec. Conversas referenciam IDs. Sem isso, fica conhecimento órfão
que se perde em 2 semanas.

**Pra ações REALMENTE triviais** (rename de label, ajuste CSS, fix
typo de cópia): especificação curta tipo 1 parágrafo no `spec.md` é
suficiente — mas o ritual permanece (branch dedicado, commit
referenciando, entrada em `BACKLOG.md > Releases`).

**Anti-pattern observado** (sessão 2026-04-25): pular speckit em
"vou fazer isso rápido" gerou 5 commits diretos em main sem
rastreabilidade (Bug 8b, mudanças de menu, label rename, etc.).
Resultou em backlog confuso e histórico de decisões disperso. **Não
repetir.**

Se o Claude propor um caminho sem speckit em qualquer atividade de
código, **interromper e exigir o ritual** antes de continuar.

---

## O que é o Sulco

App web pessoal para DJs que trabalham com vinil. Resolve uma dor específica: decidir o que levar de disco para cada set.

O Discogs já resolve "o que eu tenho". O Sulco resolve:
1. **Curadoria** — ouvir cada disco e selecionar quais faixas discotecar (A1, B2…)
2. **Organização** — anotar BPM, tom, energia, mood, contexto, comentário por faixa
3. **Montagem de set** — filtrar e combinar faixas curadas para montar a bag de um evento

**Usuário:** Felipe Kanarek, DJ, 2500+ discos de vinil, coleção no Discogs (`felipekanarek`).

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router, React Server Components) |
| Linguagem | TypeScript strict |
| Banco | SQLite via `@libsql/client` + Drizzle ORM |
| Estilo | Tailwind CSS v3 + CSS variables (sem shadcn nesta fase) |
| Validação | Zod |
| Mutações | Server Actions (`'use server'`) |
| Runtime | Node.js 20+ |

**Não usar:** Redux, Prisma, better-sqlite3, componentes de UI externos além do necessário.

---

## Estrutura de pastas

```
src/
  app/
    page.tsx                    → / coleção com filtros
    layout.tsx                  → header global + nav
    globals.css                 → tokens CSS + reset
    disco/[id]/page.tsx         → curadoria de um disco
    curadoria/page.tsx          → triagem sequencial (a implementar)
    sets/page.tsx               → lista de sets
    sets/novo/page.tsx          → criar set
    sets/[id]/page.tsx          → visualizar set + bag física
    sets/[id]/montar/page.tsx   → montar set com filtros + candidatos
  db/
    schema.ts                   → schema Drizzle (fonte da verdade)
    index.ts                    → cliente do banco (singleton)
    seed.ts                     → 30 discos de exemplo
  lib/
    actions.ts                  → todas as Server Actions
    utils.ts                    → cn(), formatDate()
```

---

## Modelo de dados

### records (discos)
Campos do Discogs (nunca editar manualmente — sincronizam):
- `discogsId`, `artist`, `title`, `year`, `label`, `country`, `format`
- `genres[]`, `styles[]`, `coverUrl`

Campos autorais do DJ (soberanos — nunca sobrescrever no sync):
- `status`: `'unrated' | 'active' | 'discarded'`
- `shelfLocation`: localização física (ex: `"E1-P2"`)
- `notes`: texto livre sobre o disco

### tracks (faixas)
Campos do Discogs:
- `position` (ex: `"A1"`, `"B3"`), `title`, `duration`

Campos de curadoria (autorais):
- `selected`: boolean — entra no repertório de DJ?
- `bpm`, `musicalKey` (ex: `"Am"` ou `"8A"`), `energy` (1–5)
- `moods[]`: tags de sensação (ex: `["solar", "festivo"]`)
- `contexts[]`: onde no set encaixa (ex: `["pico", "festa diurna"]`)
- `fineGenre`: texto livre (ex: `"samba soul orquestral"`)
- `references`: referências musicais (ex: `"lembra Floating Points"`)
- `comment`: anotação livre

### sets
- `name`, `eventDate`, `location`, `briefing` (texto do evento)
- `status`: `'draft' | 'scheduled' | 'done'`
- Relação N:N com tracks via `setTracks` (com `order`)

### playlists
- Blocos reutilizáveis de faixas
- Relação N:N com tracks via `playlistTracks` (com `order`)

---

## Regras de negócio críticas

### Sincronização com Discogs
- Campos do Discogs **nunca sobrescrevem** campos autorais do DJ
- Se o Discogs remover uma faixa → marcar como conflito, não deletar
- Se um disco sair da collection → **arquivar** (não deletar), avisar o usuário
- Rate limit: 60 req/min autenticado. Import inicial leva ~42 min para 2500 discos
- Sync automático: diário, compara só a primeira página por `date_added` desc

### Curadoria
- `status = 'unrated'` → disco ainda não avaliado para DJ
- `status = 'active'` → entra no universo de discotecagem
- `status = 'discarded'` → não leva para sets (mas mantém na collection)
- Faixas só aparecem como candidatos em sets se `selected = true` E `record.status = 'active'`

### Bag física
- Derivada automaticamente das faixas do set
- Conta discos únicos (não faixas)
- Exibe `shelfLocation` quando disponível para facilitar pegar da estante

---

## Padrões de código

### Server Actions
Todas as mutações ficam em `src/lib/actions.ts`. Padrão:

```typescript
'use server';
export async function updateTrack(trackId: number, recordId: number, formData: FormData) {
  // validar com Zod
  // executar com db
  // revalidatePath das rotas afetadas
}
```

### Queries
Usar o query builder do Drizzle. SQL raw só quando necessário.

```typescript
// Bom
const rows = await db.select().from(records).where(eq(records.status, 'active'));

// Evitar SQL raw exceto para agregações complexas
```

### Componentes
- **Server Components por padrão** — `'use client'` só quando estritamente necessário (interatividade JavaScript real)
- Componentes pequenos e co-localizados na própria página quando usados só ali
- Componentes reutilizáveis em `src/components/` (ainda não existe — criar quando necessário)

### Estilo
- Tailwind utility classes
- CSS variables definidas em `globals.css` para as cores do sistema:
  - `--ink`, `--ink-soft`, `--ink-mute`
  - `--paper`, `--paper-raised`
  - `--line`, `--line-soft`
  - `--accent`, `--accent-soft`
  - `--ok`, `--warn`
- Tipografia: `font-serif` (EB Garamond) para títulos e corpo, `font-mono` (JetBrains Mono) para metadados técnicos
- **Nunca usar Inter, Roboto ou system-ui** — quebra a identidade editorial

### Direção estética
Minimalismo editorial. Referência: New York Times Magazine + Teenage Engineering.
- Títulos grandes em itálico com tracking apertado
- Eyebrows monoespaçados em caixa alta
- Um único acento vermelho `#a4332a` usado com extrema moderação
- Zero ornamento gratuito

---

## Comandos úteis

```bash
npm run dev          # desenvolvimento em localhost:3000
npm run build        # build de produção
npm run db:push      # aplicar schema no banco
npm run db:seed      # popular com 30 discos de exemplo
npm run db:reset     # limpar e recriar tudo
```

---

## Roadmap & backlog

Lista de incrementos futuros, bugs e ideias vive em
[BACKLOG.md](./BACKLOG.md). Mantém:

- **Roadmap** — incrementos priorizados (🟢 próximos · 🟡 médios · ⚪ não-priorizados)
- **Bugs** — abertos, ideias adjacentes, histórico fechado
- **Backlog de ideias** — itens não-comprometidos, gating pra virar Incremento
- **Releases** — histórico de incrementos shipped com refs pra `specs/NNN-*/`

IDs preservam histórico (Incremento N, Bug N) — não renumerar quando
algo é fechado. Cada release detalhada vive em `specs/NNN-feature-name/`.

---

## Histórico de decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| ORM | Drizzle | TypeScript-first, zero runtime overhead, SQL explícito quando necessário |
| Banco | SQLite via libsql | Single-user, backup = copiar arquivo, sem servidor |
| Mutações | Server Actions | Sem API layer desnecessária, formulários funcionam sem JS |
| Estilo | Tailwind puro | Sem shadcn nesta fase — UI customizada demais para componentes genéricos |
| Auth | **Clerk** (abril 2026) | Free tier cobre piloto indefinidamente; "sign out all sessions" nativo para FR-002; migração para NextAuth viável caso vire SaaS com custo relevante |
| Deploy futuro | Vercel + Turso | Turso = libsql com sync multi-device quando necessário |
| Drag-and-drop | `@dnd-kit/sortable` | Keyboard sensor nativo + ARIA correto para FR-049 |
| Fuso horário | UTC at-rest, `America/Sao_Paulo` na UI | FR-028/Q4 sessão 4 — status de set derivado de eventDate |
| Allowlist (002) | Tabela própria `invites` em vez de Clerk Allowlist | Clerk Allowlist é feature Pro (~US$25/mês); piloto 2-5 amigos não justifica; owner gere via `/admin/convites` |
| Owner (002) | Bit `users.is_owner` travado via `clerkUserId` após 1º match `OWNER_EMAIL` verified | Evita ataque de "trocar email no Clerk pra virar admin" sem exigir UI/role system completo |
| Enforcement allowlist (002) | `requireCurrentUser` redirect pra `/convite-fechado` | Mais simples que DB query no middleware (Edge runtime não suporta libsql); roda só em rotas que pedem user autenticado |
| Chip visual (003) | `<Chip variant="mood\|context\|ghost" />` | Uniforme pra todos os tags de metadado; moods preenchidos accent, contexts sóbrios borda, ghost pra `+N mais`. Reusa tokens existentes. |
| Compact/Expand per-candidato (003) | Estado local `useState` por card, reset no reload | Sem persistência (DB/localStorage/cookie) — tradeoff consciente pra simplicidade, já que é UX transiente |

<!-- SPECKIT START -->
Current active feature: **023-user-facets-denormalization** (BACKLOG: Inc 24)

Authoritative planning artifacts (read these before making changes
ao novo helper `getUserFacets`/`recomputeFacets` em
`src/lib/queries/user-facets.ts`, à tabela `user_facets` no schema,
ou aos consumidores cobertos):

- Plan: [specs/023-user-facets-denormalization/plan.md](specs/023-user-facets-denormalization/plan.md)
- Spec: [specs/023-user-facets-denormalization/spec.md](specs/023-user-facets-denormalization/spec.md)
- Data Model: [specs/023-user-facets-denormalization/data-model.md](specs/023-user-facets-denormalization/data-model.md)
- Contracts: [specs/023-user-facets-denormalization/contracts/](specs/023-user-facets-denormalization/contracts/)
- Research: [specs/023-user-facets-denormalization/research.md](specs/023-user-facets-denormalization/research.md)
- Quickstart: [specs/023-user-facets-denormalization/quickstart.md](specs/023-user-facets-denormalization/quickstart.md)

Prior active (now legacy):

**022-turso-reads-optimization** (Inc 23 / BACKLOG)

Authoritative planning artifacts (read these before making changes
ao novo helper `cacheUser`/`revalidateUserCache` em `src/lib/cache.ts`,
às queries cacheadas (`queryCollection`, `collectionCounts`,
`listUserGenres`, `listUserStyles`, `listUserShelves`,
`listUserVocabulary`, `getImportProgress`, `loadStatusSnapshot`),
aos índices novos `records(user_id, archived, status)` +
`tracks(record_id, is_bomb)`, ou ao revert parcial Inc 21 em
`queryCandidates` e `pickRandomUnratedRecord`):

- Plan: [specs/022-turso-reads-optimization/plan.md](specs/022-turso-reads-optimization/plan.md)
- Spec: [specs/022-turso-reads-optimization/spec.md](specs/022-turso-reads-optimization/spec.md)
- Contracts: [specs/022-turso-reads-optimization/contracts/](specs/022-turso-reads-optimization/contracts/)
- Research: [specs/022-turso-reads-optimization/research.md](specs/022-turso-reads-optimization/research.md)
- Quickstart: [specs/022-turso-reads-optimization/quickstart.md](specs/022-turso-reads-optimization/quickstart.md)

Prior features (completed, frozen). Detalhes em `BACKLOG.md > Releases`:
- 001 sulco-piloto · 002 multi-conta · 003 faixas-ricas-montar
- 004 spotify-audio-hints-ARQUIVADO (API deprecada)
- 005 acousticbrainz-audio-features (~1200 faixas em prod)
- 006 curadoria-aleatoria
- 007 fix-sync-snapshot-fallback (Bug 11 + 12)
- 008 preview-audio-deezer-spotify-youtube (3 botões inline em
  `/disco/[id]` e `/sets/[id]/montar`)
- 009 responsividade-mobile-first (todas as rotas autenticadas
  funcionam em viewport ≤640px sem scroll horizontal)
- 010 fix-import-banner-acknowledge (Bug 13: banner de import some
  após reconhecimento; schema delta `users.import_acknowledged_at`)
- 011 random-respects-filters (botão 🎲 da home respeita filtros
  ativos; helper `buildCollectionFilters` compartilhado)
- 012 ai-byok-config (5 providers de IA via adapter pattern; chave
  encriptada por user; `enrichTrackComment` público pra Inc 13/1)
- 013 ai-track-analysis (botão "✨ Analisar com IA" por faixa em
  /disco/[id]; campo `tracks.ai_analysis`; bump constitucional 1.1.0)
- 014 ai-set-suggestions (Inc 1 — botão "✨ Sugerir com IA" em
  /sets/[id]/montar; suggestSetTracks com Promise.race 60s + parse
  JSON defensivo; reusa enrichTrackComment do Inc 14)
- 015 ai-suggestions-inline (Inc 16 — UI rework sugestões IA inline
  na lista de candidatos; <MontarCandidates> wrapper com dedup;
  zero schema delta)
- 016 edit-set-fields (Inc 15 — botão "✏️ Editar set" abre
  `<EditSetModal>` fullscreen-on-mobile; reusa `updateSet` existente;
  bump constitucional 1.2.0 — Princípio V Mobile-Native por Padrão)
- 017 acknowledge-all-archived (Inc 11 — botão "Reconhecer tudo" no
  header de "Discos arquivados" em /status quando há ≥2 pendentes;
  Server Action `acknowledgeAllArchived()` bulk single-statement com
  WHERE userId+archived+IS NULL; window.confirm + useTransition; zero
  schema delta; reusa records.archivedAcknowledgedAt)
- 018 candidate-ai-analysis-glyph (Inc 17 — `tracks.aiAnalysis` exibido
  no expandido do `<CandidateRow>` em /sets/[id]/montar (read-only);
  glyph de toggle troca de `▾`/`▸` para `−`/`+` ASCII; corrige
  incoerência onde `rankByCuration` referenciava o campo sem
  carregá-lo; zero schema delta, zero novas Server Actions)
- 019 edit-status-on-grid (Inc 19 — botões inline `Ativar`/`Descartar`/
  `Reativar` em cada item da grid `/` (ambas views) com optimistic
  UI ≤100ms via useTransition + useState<optimistic>; rollback em
  erro com auto-dismiss 5s; Inbox-zero pattern; reusa
  `updateRecordStatus`; tap target min-h-[44px] mobile +
  md:min-h-[32px] desktop; `<RecordStatusActions>` compartilhado;
  zero schema delta)
- 020 shelf-picker-autoadd (Inc 21 — `<ShelfPicker>` combobox
  substitui input livre da Prateleira em /disco/[id]; helper
  `listUserShelves` lista DISTINCT alfabético; auto-add on-the-fly
  + "— Sem prateleira —" + busca incremental case-insensitive;
  desktop popover absoluto / mobile bottom sheet via MobileDrawer;
  ARIA combobox completo + keyboard nav; Bug 15 hotfix —
  matchMedia detecta viewport pra evitar drawer vazando em desktop;
  reusa `updateRecordAuthorFields`; zero schema delta)
- 021 accent-insensitive-search (Inc 18 — busca textual em / e
  /sets/[id]/montar normaliza diacríticos; helper `normalizeText`
  em src/lib/text.ts; `buildCollectionFilters` ganha flag opcional
  `omitText`; queries fazem post-filter JS via `matchesNormalizedText`;
  `pickRandomUnratedRecord` re-estruturado com JS random; bidirecional;
  cobertura universal Unicode; zero schema delta)

Key points of 022 (Inc 23 — Otimização de leituras Turso / cota estourada):
- **3 frentes em 1 release**: revert parcial Inc 21 + cache layer
  + 2 índices.
- **Frente A — revert Inc 21**: `queryCandidates` re-aplica
  `LIMIT 1000` SQL antes do JS text filter (Decisão 7 do
  research). `pickRandomUnratedRecord` ganha **fast path** SQL
  `RANDOM() LIMIT 1` quando text vazio (1 read vs ~2500);
  slow path JS post-filter Inc 18 preservado quando text presente.
- **Frente B — cache via `unstable_cache` Next 15**: novo helper
  [src/lib/cache.ts](src/lib/cache.ts) com `cacheUser(fn, name)`
  + `revalidateUserCache(userId)`. Pattern: cache key composto
  (nome + userId + args serializados deterministicamente), tag
  `user:${userId}` (Decisão 3 — invalidação grossa por user),
  TTL 300s (Clarification Q2 — guard-rail contra bug de
  invalidação esquecida).
- **8 queries cacheadas** (Clarification Q1 incluiu
  `queryCollection`): `queryCollection`, `collectionCounts`,
  `listUserGenres`, `listUserStyles`, `listUserShelves`,
  `listUserVocabulary`, `getImportProgress`, `loadStatusSnapshot`.
- **`queryCandidates` NÃO cacheada**: filtros muito variados →
  fragmentação alta. LIMIT 1000 já reduz drasticamente.
- **Server Actions de write** (updateRecordStatus, updateRecord-
  AuthorFields, updateTrackCuration, acknowledge*, addTrackToSet,
  etc.) chamam `revalidateUserCache(user.id)` no fim, em
  ADIÇÃO ao `revalidatePath` existente.
- **Frente C — 2 índices composite**:
  `records(user_id, archived, status)` cobre filtro combinado em
  `queryCollection`; `tracks(record_id, is_bomb)` cobre lookup de
  bombs. Aplicados via Turso shell em prod com
  `CREATE INDEX IF NOT EXISTS` (online, sem downtime).
- **Sem mudanças observáveis na UI** — backend puro.
- **Vercel Hobby compatível**: Data Cache per-region é OK pra
  user solo BR; cold start = miss ocasional aceitável; cache size
  ~100KB total bem dentro do limite Hobby.
- **Princípios I (leitura), II (cache server-side), III (só
  índices), IV (nada deletado), V (ganho universal cross-device)**
  todos OK.

Key points of 021 (Inc 18 — Busca insensitive a acentos):
- **Zero schema delta**. Sem novas Server Actions.
- **Helper puro novo**: `normalizeText(s)` em
  [src/lib/text.ts](src/lib/text.ts) — `lowercase + NFD +
  replace(/\p{M}/gu, '')`. Cobre todos os diacríticos Unicode
  (não só pt-BR). Auxiliar `matchesNormalizedText(haystacks,
  query)` pra DRY nos callsites.
- **JS-side post-query** (não schema delta): SQLite/Turso não
  têm `unaccent` nativo, e schema delta seria custoso pra
  manter (sync writes). Para escala atual (~2500 records / ~10k
  tracks por user) o filter em memória é trivial (≤500ms total
  conforme SC-002).
- **3 callsites adaptados**:
  - `buildCollectionFilters` em
    [src/lib/queries/collection.ts](src/lib/queries/collection.ts)
    ganha flag opcional `omitText` (default false; preserva
    callers existentes).
  - `queryCollection` chama com `omitText: true` e aplica
    `matchesNormalizedText([artist, title, label], q.text)` no
    resultado, antes da agregação de tracks (economiza JOIN
    pra rows descartadas).
  - `queryCandidates` em
    [src/lib/queries/montar.ts](src/lib/queries/montar.ts)
    remove o LIKE textual SQL; aplica filtro JS sobre
    `[title, artist, recordTitle, fineGenre]`. **Limit move pra
    JS** (`slice(0, opts.limit ?? 300)`) pra não cortar
    candidatos válidos antes do text filter.
  - `pickRandomUnratedRecord` em
    [src/lib/actions.ts](src/lib/actions.ts) (Inc 11) re-estrutura:
    SQL filtra non-text → JS post-filter por text → JS
    `Math.random()` sobre filtrado. Mantém aleatoriedade
    uniforme.
- **Bidirecional**: termo digitado E valor no DB são
  normalizados antes de comparar (FR-003). Paridade verificável.
- **Filtros multi-select de tag** (genres, styles, moods,
  contexts) **continuam igualdade exata** — vocabulário canônico
  por design (Decisão 8 do research). DJ não digita esses como
  texto livre. `fineGenre` (texto livre) entra no text filter
  geral.
- **Princípio I respeitado**: feature é puramente leitura.
- **Princípio III respeitado**: zero schema delta. Schema
  continua single source.
- **Princípio V (Mobile-Native)**: ganho maior em mobile —
  teclado virtual sem fluxo natural pra acento; quickstart
  cenário 5.

Key points of 020 (Inc 21 — Prateleira como select picker com auto-add):
- **Zero schema delta**. Reusa coluna `records.shelfLocation` (text
  max 50, nullable) já existente.
- **Zero novas Server Actions de escrita**. Reusa
  `updateRecordAuthorFields` existente em
  [src/lib/actions.ts:737](src/lib/actions.ts) (Zod
  `max(50).nullable()` + ownership + revalidatePath em
  `/disco/${id}`, `/curadoria`, `/`).
- **1 helper query novo (server-only)**: `listUserShelves(userId)`
  em [src/lib/queries/collection.ts](src/lib/queries/collection.ts)
  — `selectDistinct shelfLocation WHERE userId = ? AND
  shelfLocation IS NOT NULL ORDER BY lower(shelfLocation)`.
- **1 client component novo**: `<ShelfPicker>` em
  [src/components/shelf-picker.tsx](src/components/shelf-picker.tsx).
  Props: `{ recordId, current, userShelves, className? }`.
  Combobox com input de busca + lista filtrada + opção
  "+ Adicionar 'X' como nova prateleira" + "— Sem prateleira —".
- **Desktop**: popover absoluto `md:max-w-[400px]` + `max-h-[300px]`
  scroll. **Mobile**: bottom sheet via `<MobileDrawer side="bottom">`
  (primitiva Inc 009, com portal + ESC + body scroll lock + safe
  area inset). Mesma `<ListPanel>` em ambos.
- **Casing preservado** (Decisão 1): `trim()` apenas, sem
  UPPERCASE forçado. Filtragem case-insensitive na busca; match
  exato pra suprimir "+ Adicionar" é case-sensitive (FR-005).
- **Ordenação alfabética case-insensitive** (não LRU — Decisão 2).
- **Save-on-click** (Decisão 4): clique no item compromete; fechar
  o picker sem clicar mantém valor anterior. Otimismo via
  `useState<optimistic>` + `useTransition`; rollback em erro com
  auto-dismiss 5s (mesma UX Inc 19).
- **ARIA combobox** completo (Decisão 6): `role="combobox"` no
  input, `role="listbox"` na lista, `aria-activedescendant` pra
  navegação por teclado (↑/↓/Enter/Escape).
- **Princípio I respeitado**: `shelfLocation` continua AUTHOR;
  feature toca apenas a UI de escrita.
- **Princípio V respeitado**: bottom sheet fullscreen-friendly em
  mobile; tap targets ≥44 px (`min-h-[44px] md:min-h-[36px]`).
- **`<RecordControls>` ajustado**: substitui o `<input
  type="text">` da seção Prateleira (linhas 87-101) por
  `<ShelfPicker>`; ganha prop `userShelves: string[]`.
- **`/disco/[id]/page.tsx` ajustado**: chama `listUserShelves(user.id)`
  no RSC e passa pra `<RecordControls>`.

Key points of 019 (Inc 19 — Editar status do disco direto na grid):
- **Zero schema delta**. Reusa coluna `records.status` existente.
- **Zero novas Server Actions**. Reusa `updateRecordStatus`
  existente em [src/lib/actions.ts:568](src/lib/actions.ts) (Zod +
  ownership via `requireCurrentUser` + revalidatePath em `/`,
  `/curadoria`, `/disco/${id}`).
- **1 client component novo**: `<RecordStatusActions>` em
  [src/components/record-status-actions.tsx](src/components/record-status-actions.tsx).
  Props: `{ recordId, status, recordLabel, className? }`.
  `useTransition` + `useState<optimistic>` + `useState<error>` com
  auto-dismiss 5s. Botões condicionais por status: `unrated` →
  Ativar+Descartar; `active` → Descartar; `discarded` → Reativar.
- **Optimistic UI** ≤100ms (SC-002): badge muda imediato via
  `displayStatus = optimistic ?? props.status`; rollback em erro
  (`setOptimistic(null)`); revalidação RSC sincroniza após sucesso.
- **Inbox-zero pattern** (Clarification Q1): card some
  naturalmente após `revalidatePath('/')` quando filtro corrente
  exclui o status novo (~1s pós-clique). Sem código novo —
  reuso do pipeline existente.
- **Erro com auto-dismiss 5s** (Clarification Q2): timer
  `useEffect` + setTimeout; some também ao disparar nova ação
  em qualquer card. Sem botão fechar manual.
- **Sem confirmação** (Princípio IV: status reversível).
- **Layout responsivo**: `min-h-[44px] md:min-h-[32px]` (Princípio
  V tap target mobile + densidade desktop preservada).
- **Integrado em ambas as views**: `<RecordRow>` (list) e
  `<RecordGridCard>` (grid). Componente compartilhado, layout
  absorvido por `className` do pai.
- **Discos `archived=true` ficam fora**: fluxo separado em
  `/status` (Inc 11/017). Component só renderizado pra discos
  não-arquivados.
- **Princípio I respeitado**: `status` é AUTHOR; escrita só via
  clique do DJ.
- **Princípio V respeitado**: tap target mobile + cenário 9, 10
  do quickstart.

Key points of 018 (Inc 17 — Análise IA + glyph de expandir nos candidatos):
- **Zero schema delta**. Reusa coluna `tracks.aiAnalysis` (Inc 13).
- **Zero novas Server Actions**. Refator localizado em 2 arquivos
  ([src/lib/queries/montar.ts](src/lib/queries/montar.ts) +
  [src/components/candidate-row.tsx](src/components/candidate-row.tsx)).
- **Parte 1 — exibir análise IA**: tipo `Candidate` ganha
  `aiAnalysis: string | null`; `queryCandidates` adiciona o campo
  ao SELECT (corrige incoerência atual em que `rankByCuration`
  referencia o campo no score mas a query não carrega). No
  expandido do `<CandidateRow>` (col-1 do grid 2-col), seção
  "Análise" renderiza apenas quando `aiAnalysis.trim().length > 0`,
  abaixo de "Comentário". Sem placeholder, sem CTA, **read-only**
  (edição segue exclusiva em `/disco/[id]` via Inc 13).
- **Parte 2 — trocar glyph de expand**: `▾`/`▸` substituídos por
  `−` (U+2212) / `+` (U+002B). ASCII universal, zero ambiguidade
  com `▶` dos botões de preview (Inc 008). ARIA preservado
  (`aria-expanded`, `aria-controls`, `aria-label`).
- **Visual da seção "Análise"**: `label-tech text-ink-mute` no título
  + `font-serif italic text-[13px] text-ink whitespace-pre-line` no
  corpo; **sem aspas** (diferenciando de "Comentário" que tem voz
  humana literal). Coerente com `<TrackCurationRow>` em /disco/[id].
- **Princípio V cumprido**: tap target do toggle preserva
  `w-11 h-11 md:w-8 md:h-8` (44×44 mobile, 32×32 desktop — status
  quo Inc 009). Quickstart inclui cenários mobile + acessibilidade.
- **Princípio I respeitado**: feature é puramente leitura de campo
  AUTHOR híbrido. Sem novo write.

Key points of 017 (Inc 11 — Botão "Reconhecer tudo" no banner de archived):
- **Zero schema delta**. Reusa coluna `records.archivedAcknowledgedAt`
  já existente.
- **1 Server Action nova**: `acknowledgeAllArchived()` (sem input —
  derivar `userId` da sessão via `requireCurrentUser()`). Bulk UPDATE
  single-statement com `WHERE userId = ? AND archived = 1 AND
  archivedAcknowledgedAt IS NULL`. Atomicidade garantida pelo SQLite.
- **Retorno consistente**: `{ ok: true, count }` ou
  `{ ok: false, error }` (mesmo shape de `updateSet`).
- **1 client component novo**: `<AcknowledgeAllArchivedButton>` com
  `useTransition` + `window.confirm("Marcar todos os N como
  reconhecidos?")` antes de chamar a action. `disabled` com label
  "Reconhecendo…" enquanto `isPending` (FR-009).
- **Threshold de visibilidade**: botão só renderiza quando
  `archivedPending.length >= 2`. Com 1 pendente, botão individual
  basta (FR-002).
- **Posicionamento**: header da seção "Discos arquivados" em
  [src/app/status/page.tsx](src/app/status/page.tsx), próximo ao
  contador "N pendentes". Sem container novo.
- **`revalidatePath('/status')` + `revalidatePath('/')`**: banner
  global some em todas as rotas após sucesso (SC-002).
- **Princípio V (Mobile-Native, 1.2.0) cumprido**: tap target
  ≥44×44 px (FR-010), `window.confirm` é fullscreen nativo em
  iOS/Android. Quickstart inclui cenário 5 mobile (375×667).
- **Princípio I respeitado**: `archivedAcknowledgedAt` é zona SYS,
  não AUTHOR. Sync não escreve aqui.
- **Princípio IV respeitado**: action não deleta nada — apenas marca
  timestamp.
- **Multi-user isolation** garantida pelo `WHERE userId = ?` (SC-003).
- **`acknowledgeArchivedRecord` existente intacto** (botão individual
  em `<ArchivedRecordRow>` continua funcionando).

Key points of 016 (Inc 15 — Editar briefing/set após criação):
- **Server Action `updateSet` JÁ existe** em `src/lib/actions.ts:945`
  (partial update via Zod, ownership check, normalizeDate,
  revalidatePath nas 3 rotas). Esta feature entrega APENAS a UI.
- **`<EditSetModal>`** novo client component em
  `src/components/edit-set-modal.tsx` (~150 linhas). Pattern espelha
  `<DeleteAccountModal>` existente: state local `open`, modal
  fullscreen com `role="dialog"`, ESC + clique no overlay fecham.
- **Botão "✏️ Editar set"** no header de `/sets/[id]/montar`,
  posicionado próximo ao título do set.
- **4 campos**: name (required, max 200), eventDate (datetime-local
  nativo, opcional), location (max 200, opcional), briefing
  (textarea, max 5000, opcional). Pré-preenchidos com valores
  atuais ao abrir.
- **Validação client-side**: botão Salvar disabled se name vazio
  ou >200 chars; briefing >5000 bloqueado por maxLength input.
  Defesa em profundidade — Zod do `updateSet` valida server-side.
- **Reset do form ao reabrir**: useEffect dispara quando `open`
  muda de false→true, descarta edits cancelados (Decisão 7).
- **Salvamento bem-sucedido** fecha modal + chama `router.refresh()`
  pra RSC re-fetch valores.
- **Editar briefing alimenta IA imediatamente**: `revalidatePath`
  garante que próxima invocação do "✨ Sugerir com IA" (Inc 14)
  usa novo briefing (FR-008 do Inc 15).
- **Princípio I respeitado**: `updateSet` (existente) tem ownership
  check; sem nova escrita, sem regressão.
- **Zero schema delta, zero novas Server Actions**.

Key points of 015 (Inc 16 — UI rework sugestões IA inline):
- **Zero schema delta, zero novas Server Actions**. Refator
  puramente de UI/orquestração.
- **Lista única**: cards de sugestão IA aparecem no TOPO da
  listagem de candidatos existente (mesma `<ol>`), com moldura
  accent + bg paper-raised + badge solid + justificativa em
  destaque (text-[15px] text-ink). Candidatos comuns abaixo sem
  destaque, ordem original.
- **Dedup explícita** (FR-002a, Q1 da clarify): trackIds que estão
  nas sugestões IA são removidos da lista de candidatos comuns.
  Cada faixa aparece apenas uma vez visualmente.
- **Reposicionamento**: painel sai de "entre briefing e filtros"
  pra "abaixo dos filtros". Hierarquia: briefing → filtros →
  Candidatos (header + listagem unificada).
- **Botão "Ignorar sugestões"** novo: aparece apenas quando há
  sugestões ativas, reseta state pra `idle` (volta candidatos
  default). Sem confirmação.
- **`<MontarCandidates>`** novo client wrapper que absorve
  responsabilidades do `<AISuggestionsPanel>` (REMOVIDO) e do
  `<ol>` de cards no page.tsx. Estado de sugestões encapsulado
  no wrapper.
- **`<CandidateRow>` extensão visual** quando `aiSuggestion`
  presente: border-2 border-accent/60, bg-paper-raised, badge
  solid bg-accent text-paper, justificativa text-[15px] italic
  text-ink leading-relaxed.
- **Comportamento Inc 14 preservado**: confirmação no re-gerar,
  cards adicionados permanecem visíveis, multi-user isolation,
  mensagens de erro contextuais.
- **`suggestSetTracks` e `addTrackToSet` intactos** — apenas
  componentes consumindo são refatorados.

Key points of 014 (Inc 1 — Briefing com IA em /sets/montar):
- **Zero schema delta**. Reusa `sets`, `set_tracks`, `tracks`,
  `records`, e config Inc 14.
- **1 Server Action nova**: `suggestSetTracks(setId)` orquestra
  ownership + carrega briefing + L2 (set tracks completo) + L3
  (catálogo elegível truncado em 50 via `queryCandidates`
  estendida com `rankByCuration`) + chama `enrichTrackComment`
  com `Promise.race(60s)` + parse JSON defensivo + filtragem
  anti-hallucination/duplicação.
- **Prompt builder** novo em `src/lib/prompts/set-suggestions.ts`:
  `buildSetSuggestionsPrompt` + `parseAISuggestionsResponse`
  (extrai bloco JSON entre fences markdown ou inline; valida via
  Zod).
- **L2 sem ceiling** (todas as faixas atuais do set vão), **L3
  ceiling 50** (truncamento "mais bem-curadas" — score = campos
  AUTHOR não-nulos, desempate por `updatedAt DESC`).
- **`queryCandidates` estendida** com `opts: { rankByCuration?,
  limit? }` opcional. Comportamento default preservado (UI manual
  intacta).
- **UI**: bloco vertical em `/sets/[id]/montar` entre briefing e
  listagem manual. Reusa `<CandidateRow>` com prop opcional
  `aiSuggestion` que adiciona badge "✨ Sugestão IA" + justificativa
  em itálico. Sem componente novo de card — DRY total.
- **`<AISuggestionsPanel>`** client component novo: estado em
  memória das sugestões + handlers (gerar, adicionar individual,
  re-gerar com `window.confirm` se há pendentes).
- **Cards adicionados permanecem visíveis** (FR-008): flag
  `added=true` no estado, sem remover. Justificativa segue
  acessível.
- **Sem batch**: cada sugestão tem botão "Adicionar ao set"
  individual. Sem "Aplicar todas".
- **IA propõe COMPLEMENTOS apenas** — nunca sugere remover faixas
  do set. Refatoração fica como Inc futuro.
- **Catálogo elegível vazio** = curto-circuito ANTES de chamar
  provider (FR-011, SC-006). Zero tokens consumidos.
- **5-10 sugestões alvo** por geração (instruído no prompt).
- **Princípio I respeitado**: IA não escreve em `set_tracks` —
  apenas sugere. DJ executa via `addTrackToSet` (existente).

Key points of 013 (Inc 13 — Análise via IA):
- **Schema delta de 1 coluna**: `tracks.ai_analysis` (text nullable).
  Aplicar via sqlite3 local + Turso CLI prod (mesmo padrão Inc 010/012).
- **AUTHOR híbrido**: IA escreve via clique do DJ (intencional,
  manual). DJ pode editar livremente como `comment`. Princípio I OK.
- **2 Server Actions novas**: `analyzeTrackWithAI(trackId)` (gera +
  persiste) e `updateTrackAiAnalysis(trackId, recordId, text)`
  (edição manual, auto-save-on-blur). Ambas com ownership check.
- **Reusa `enrichTrackComment` do Inc 14** sem mudança. Adapter
  pattern já validado.
- **Prompt isolado** em `src/lib/prompts/track-analysis.ts`
  (função pura `buildTrackAnalysisPrompt`). Multi-linha:
  L1=metadados Discogs, L2=audio features, L3=instrução pt-BR
  com soft limit 500 chars + max_tokens 200.
- **Bloco "Análise" sempre visível** dentro do estado expandido do
  `<TrackCurationRow>`, abaixo do bloco "Sua nota". Placeholder
  quando vazio. Botão "✨ Analisar com IA" dentro do bloco (não
  inline com botões de preview do Inc 008).
- **Re-gerar exige confirmação** se já há conteúdo
  (`window.confirm`, mesmo pattern do Inc 14). Apagar texto vira
  `NULL`.
- **Botão visível em todas as faixas** independente de `selected`
  (FR-010a — análise antecede decisão de selecionar).
- **Sem chave configurada** → botão disabled com tooltip "Configure
  sua chave em /conta" (estado server-render via
  `getUserAIConfigStatus`).
- **Constituição bump 1.1.0**: `aiAnalysis` adicionado à lista
  AUTHOR de tracks no Princípio I.

Key points of 012 (Inc 14 — BYOK):
- **5 providers de IA suportados**: Gemini, Anthropic, OpenAI,
  DeepSeek, Qwen. Lista de modelos curada em `src/lib/ai/models.ts`,
  versionada com `MODELS_REVIEWED_AT`.
- **Schema delta de 3 colunas** em `users`: `aiProvider` (enum
  nullable), `aiModel` (text nullable), `aiApiKeyEncrypted` (text
  nullable). Atomicidade garantida (3 nulas OU 3 preenchidas).
- **Reusa criptografia AES-256-GCM** existente: `MASTER_ENCRYPTION_KEY`
  + helpers `encryptSecret`/`decryptSecret` (aliases novos de
  `encryptPAT`/`decryptPAT`). Sem nova env var.
- **Adapter pattern** em `src/lib/ai/`: 1 interface `AIAdapter`,
  3 implementações (Gemini SDK próprio, Anthropic SDK próprio,
  `openai-compat` compartilhado entre OpenAI/DeepSeek/Qwen via
  `baseURL` parametrizado).
- **Testar é o único caminho de salvar** (FR-005): ping bem-sucedido
  persiste imediatamente; sem botão "Salvar sem testar". Garante
  config no DB sempre válida no momento do salvamento.
- **Timeout do ping = 10s** (Q3). Server Actions ≤60s.
- **Server-render decide visibilidade** de UIs dependentes (Q4).
  Inc 13/1 vão consumir `getUserAIConfigStatus` do RSC. Sem flash de
  estado, alinha com Server-First (Princípio II).
- **Trocar provider apaga key** (decisão UX): exige confirmação
  explícita. Sem dead state.
- **Princípio I respeitado**: `ai_*` é zona SYS (credencial), não
  AUTHOR. Apenas o próprio DJ escreve via `/conta`.
- **Pré-requisito de Inc 13** (enriquecer comment) **e Inc 1**
  (briefing). Esta feature entrega só infra; botões consumidores
  ficam fora de escopo.
- **3 SDKs novos**: `@google/generative-ai`, `@anthropic-ai/sdk`,
  `openai`. Justificáveis (compat OpenAI permite 3 providers em 1
  SDK). Sem libs proibidas.
<!-- SPECKIT END -->
