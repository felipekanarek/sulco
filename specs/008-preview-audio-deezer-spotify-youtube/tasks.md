# Tasks: Preview de áudio (Deezer + Spotify + YouTube) (008)

**Input**: Design documents from `/specs/008-preview-audio-deezer-spotify-youtube/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Incluídos. SC-004 (Princípio I) exige regressão automatizada explícita; demais testes blindam invariantes de cache (resolve/hit/marker) e UX (1 player por vez via Context).

**Organization**: Tasks agrupadas por user story da spec.md. Cada fase US* entrega um incremento testável independentemente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência em tarefa incompleta)
- **[Story]**: User story alvo (US1, US2)
- Paths absolutos quando ambíguos. Repo root: `/Users/infoprice/Documents/Projeto Sulco/sulco/`

## Path Conventions

- Código: `src/lib/`, `src/app/`, `src/components/`, `src/db/`
- Testes: `tests/{unit,integration}/`
- Projeto Next.js single-package — sem split backend/frontend

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estrutura de diretórios e schema delta. Nada aqui gera comportamento observável.

- [X] T001 Criar diretório `sulco/src/lib/preview/` com 2 arquivos-esqueleto (`deezer.ts` com `import 'server-only';` e `urls.ts` SEM `server-only` — `urls.ts` é client-safe). Cada arquivo só com comentário de propósito no topo. Não implementar lógica ainda.
- [X] T002 Adicionar 2 colunas em `sulco/src/db/schema.ts` dentro da tabela `tracks`, na zona SYS (após `audioFeaturesSyncedAt`): `previewUrl: text('preview_url')` e `previewUrlCachedAt: integer('preview_url_cached_at', { mode: 'timestamp' })`. Sem novo índice (acesso é sempre por `tracks.id`).
- [X] T003 Rodar `npm run db:push` em `sulco/` e validar que as 2 colunas novas existem no DB local. Confirmar via `sqlite3 sulco.db ".schema tracks"`. Se aparecer prompt interativo de drift (igual no 005), abortar e aplicar via SQL direto: `ALTER TABLE tracks ADD COLUMN preview_url TEXT; ALTER TABLE tracks ADD COLUMN preview_url_cached_at INTEGER;`.

**Checkpoint**: Setup pronto — schema delta aplicado em dev; diretório de lib criado.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: URL builders puros (client-safe), cliente Deezer, Server Actions, Context provider — tudo que ambas user stories consomem.

**⚠️ CRITICAL**: Nenhuma US pode começar antes desta fase terminar.

- [X] T004 [P] Implementar `spotifySearchUrl(artist, title): string` e `youtubeSearchUrl(artist, title): string` em `sulco/src/lib/preview/urls.ts`. Encoding via `encodeURIComponent`. Spotify: `https://open.spotify.com/search/<encoded>`. YouTube: `https://www.youtube.com/results?search_query=<encoded>`. Funções puras, sem `server-only`.
- [X] T005 [P] Teste unit em `sulco/tests/unit/preview-urls.test.ts`: cobertura de encoding básico ("Spoon Before Destruction"), acentos pt-BR ("Caetano Veloso Pulsar"), aspas/apóstrofo ("Don't Stop"), e caracteres especiais. Asserta exact-match de URLs geradas.
- [X] T006 Implementar cliente Deezer em `sulco/src/lib/preview/deezer.ts` exportando `searchTrackPreview(artist: string, title: string): Promise<{ previewUrl: string | null; matchedTitle: string; matchedArtist: string } | null>`. Endpoint `GET https://api.deezer.com/search?q=<encoded>&limit=1`. User-Agent `Sulco/0.1 ( marcus@infoprice.co )`. Timeout 8s. `null` quando `data: []`. `previewUrl: null` quando `data[0].preview === ''`. Throw em 503/timeout (caller decide retry).
- [X] T007 Estender `sulco/src/lib/actions.ts` com Server Action `resolveTrackPreview(input: { trackId: number }): Promise<ActionResult<{ deezerUrl: string | null; cached: boolean }>>` seguindo contrato em `contracts/server-actions.md`. Fluxo: ownership check → cache hit retorna `cached: true` direto → cache miss chama `searchTrackPreview`, persiste em DB (`UPDATE tracks SET preview_url=?, preview_url_cached_at=now() WHERE id=?`), retorna `cached: false`. Em erro de network NÃO persiste cache.
- [X] T008 Estender `sulco/src/lib/actions.ts` com Server Action `invalidateTrackPreview(input: { trackId: number }): Promise<ActionResult>`. Reseta `preview_url=NULL, preview_url_cached_at=NULL`. Ownership check. Sem revalidatePath (cliente recarrega via re-call de resolveTrackPreview).
- [X] T009 Criar React Context `sulco/src/components/preview-player-context.tsx` (client component). Estado `{ currentTrackId: number | null; setCurrent: (id: number|null) => void }`. Export: `<PreviewPlayerProvider>`, hook `usePreviewPlayer()`. Implementação trivial via `useState`.
- [X] T010 Estender `sulco/src/app/layout.tsx` envolvendo `{children}` com `<PreviewPlayerProvider>`. Provider deve estar DENTRO do `<html>/<body>` mas fora de qualquer outro provider de feature.
- [X] T011 Estender `sulco/src/lib/queries/curadoria.ts` (função `loadDisc`): incluir `previewUrl` e `previewUrlCachedAt` no SELECT e no tipo `CuradoriaDisc.tracks[]`. Adicionar campos correspondentes ao mapping final.
- [X] T012 Estender `sulco/src/lib/queries/montar.ts` (função `queryCandidates` e tipo `Candidate`): incluir `previewUrl` e `previewUrlCachedAt`. Mapping final inclui os campos.

**Checkpoint**: Foundational pronto — URLs puras testadas, cliente Deezer + actions implementados, Context provider montado, queries expostas com novos campos.

---

## Phase 3: User Story 1 — Ouvir faixa antes de marcar selected na curadoria (Priority: P1) 🎯 MVP

**Goal**: DJ abre `/disco/[id]`, vê 3 botões (▶ Deezer / ↗ Spotify / ↗ YouTube) em cada faixa, clica ▶ e ouve 30s sem sair da página.

**Independent Test**: Abrir disco de Spoon (record 1860, já enriquecido pelo 005), clicar ▶ na A1; áudio toca em ≤3s; clicar ▶ na A2 enquanto A1 toca; A1 pausa, A2 começa; áudio termina sozinho aos 30s e botão volta pra ▶.

- [X] T013 [US1] Criar `sulco/src/components/preview-controls.tsx` (client component). Props: `{ trackId: number; artist: string; title: string; initialPreviewUrl: string | null; initialCachedAt: Date | null }`. Renderiza linha horizontal `[▶/⏸/⟳] [↗ Spotify] [↗ YouTube]`. Estado interno discriminated union (idle/loading/playing/unavailable). Implementa: click no ▶ chama `resolveTrackPreview` (com `AbortController` ref), recebe deezerUrl, cria `<audio src=...>`, `play()`, transition pra `playing`. `<audio onEnded>` → volta pra `idle`. `<audio onError>` → state `unavailable: 'load-error'` + botão "tentar de novo" que chama `invalidateTrackPreview` + re-dispara `resolveTrackPreview`. Spotify/YouTube hrefs gerados via `spotifySearchUrl`/`youtubeSearchUrl` com `target="_blank" rel="noopener"`. Integração com `usePreviewPlayer()`: ao começar a tocar chama `setCurrent(myId)`; useEffect compara `currentTrackId !== myId` e pausa via ref do `<audio>`.
- [X] T014 [US1] Estender `sulco/src/components/track-curation-row.tsx` pra renderizar `<PreviewControls trackId={local.id} artist={recordArtist} title={local.title} initialPreviewUrl={local.previewUrl} initialCachedAt={local.previewUrlCachedAt} />` no header da faixa (próximo ao título e duração). Adicionar `previewUrl` + `previewUrlCachedAt` no tipo `TrackData`. Componente recebe `recordArtist` via prop (a página `/disco/[id]` passa `disc.artist` adiante).
- [X] T015 [US1] Estender `sulco/src/app/disco/[id]/page.tsx` pra propagar `record.artist` ao `<TrackCurationRow>` (já passa `track`; precisa passar artist do disco também). Verificar via leitura do código que `previewUrl`/`previewUrlCachedAt` já estão sendo retornados por `loadDisc` (T011) e propagados via `track`; ajustar a página caso T011 não tenha exposto os campos no shape consumido aqui.
- [X] T016 [P] [US1] Teste de integração em `sulco/tests/integration/preview-resolve-cache.test.ts`. Cenário 1: track sem cache → mock `fetch` retorna `{ data: [{ preview: 'https://x.mp3', ... }] }` → `resolveTrackPreview` retorna `{ deezerUrl: 'https://x.mp3', cached: false }` + persiste no DB. Cenário 2: track com `previewUrl='https://x.mp3'` em cache → 2ª chamada retorna `cached: true` SEM chamar fetch (assert via spy). Cenário 3: `invalidateTrackPreview` reseta colunas pra NULL.
- [X] T017 [P] [US1] Teste de integração em `sulco/tests/integration/preview-no-deezer-fallback.test.ts`. Mock `fetch` retorna `{ data: [], total: 0 }`. `resolveTrackPreview` retorna `{ deezerUrl: null, cached: false }` e persiste `previewUrl='', previewUrlCachedAt=now`. 2ª chamada retorna `cached: true` com `deezerUrl: null` SEM fetch. (Marker funciona.)
- [X] T018 [P] [US1] Teste de integração em `sulco/tests/integration/preview-principio-i.test.ts` (cobre SC-004): pré-popula track com `bpm=120, musicalKey='8A', moods=['solar'], audioFeaturesSource='manual'`. Chama `resolveTrackPreview` (mock fetch retorna URL válida). Asserta que TODOS os campos AUTHOR continuam intactos: `bpm=120`, `musicalKey='8A'`, `moods=['solar']`, `audioFeaturesSource='manual'`. Asserta que apenas `previewUrl` e `previewUrlCachedAt` foram alterados.
- [X] T018a [P] [US1] Teste de componente em `sulco/tests/integration/preview-single-player.test.tsx` (cobre FR-007 cross-componente): renderiza `<PreviewPlayerProvider>` envolvendo dois `<PreviewControls>` (trackId 1 e trackId 2) na mesma árvore (simulando coexistência curadoria↔montar via Context global). Aciona play no controle 1, asserta que está em `playing`. Aciona play no controle 2, asserta que controle 1 voltou pra `idle` (pause via Context `currentTrackId !== myId`) e controle 2 entrou em `playing`. Mock de `<audio>` via spy em `HTMLMediaElement.prototype.play/pause`.

**Checkpoint**: US1 entregue — preview tocando inline na curadoria, link-outs funcionais, Princípio I blindado.

---

## Phase 4: User Story 2 — Decidir candidato durante montagem de set (Priority: P1)

**Goal**: DJ em `/sets/[id]/montar`, mesma feature de player + link-outs nos `<CandidateRow>`.

**Independent Test**: Abrir `/sets/[id]/montar` de qualquer set, aplicar filtros, clicar ▶ numa candidata; ouvir; clicar + pra adicionar à bag (preview NÃO interrompe); clicar ▶ em outra candidata (anterior pausa, nova começa).

- [X] T019 [US2] Estender `sulco/src/components/candidate-row.tsx` pra renderizar `<PreviewControls trackId={candidate.id} artist={candidate.artist} title={candidate.title} initialPreviewUrl={candidate.previewUrl} initialCachedAt={candidate.previewUrlCachedAt} />`. Local: ao lado do título da faixa ou em coluna dedicada (manter estética compacta da listagem). Adicionar `previewUrl` + `previewUrlCachedAt` ao tipo `Candidate`.
- [X] T020 [US2] Verificar via grep em `sulco/src/app/sets/[id]/montar/page.tsx` que `previewUrl` e `previewUrlCachedAt` estão presentes nas props passadas a `<CandidateRow>` (consequência de T012 expondo os campos em `queryCandidates` e `Candidate`). Se a página fizer mapping/pick explícito que omita os novos campos, ajustar pra incluí-los. Resultado esperado: zero mudança ou uma mudança mínima de propagação.
- [X] T021 [P] [US2] Teste e2e skeleton (`describe.skip`) em `sulco/tests/e2e/preview-montar.spec.ts` cobrindo cenário "click ▶ + click ▶ outra → primeira pausa". TODO ativar quando pipeline Clerk + seed determinístico estiverem prontos. Padrão idêntico aos e2e de outras features (ver tests/e2e/curadoria-faixas.spec.ts).

**Checkpoint**: US2 entregue — preview disponível na montagem; "1 player por vez" valida cross-página via Context global.

---

## Phase 5: Polish & Cross-Cutting

**Purpose**: Consolidação final, validação manual e atualização de docs.

- [ ] T022 [P] Validar passagem completa do quickstart.md (cenários 1–5) em ambiente local. Anotar qualquer divergência. Especialmente importante: tempo de 1ª resolução (SC-001 ≤3s) e cache hit (<500ms).
- [X] T023 [P] Atualizar `sulco/README.md` adicionando seção breve "Preview de áudio (008)" com endpoint Deezer usado, User-Agent e schema delta. Link pra spec 008.
- [ ] T024 Aplicar schema delta em **Turso prod** via CLI: `turso db shell sulco-prod "ALTER TABLE tracks ADD COLUMN preview_url TEXT; ALTER TABLE tracks ADD COLUMN preview_url_cached_at INTEGER;"`. Verificar via `.schema tracks`. Operação aditiva, sem perda de dados (mesmo padrão do schema delta do 005).
- [X] T025 Rodar `npx tsc --noEmit` no repo e corrigir qualquer erro introduzido pela feature. Zero erros/warnings novos.
- [X] T026 Rodar suíte completa de testes (`npm test`) e validar verde. Se algum teste de 001–007 quebrou, investigar (não aceitar regressão sem justificativa escrita).
- [X] T027 Atualizar `sulco/BACKLOG.md` movendo Incremento 5b da seção "Próximos" pra "Releases" com ref `008-preview-audio-deezer-spotify-youtube`. Registrar como ✅ entregue.

---

## Dependency Graph

```
Phase 1 (Setup: T001–T003)
  └─→ Phase 2 (Foundational: T004–T012)
        ├─→ Phase 3 (US1: T013–T018) ──┐
        └─→ Phase 4 (US2: T019–T021) ──┴─→ Phase 5 (Polish: T022–T027)
```

**Story independence**: US1 e US2 dividem `<PreviewControls>` (criado em T013, fase US1). T019 (US2) **depende de T013 (US1)**. Isso quebra a "independência" estrita de stories no template, mas é intencional — não faz sentido duplicar componente. Implementação pragmática: completar Phase 3 (US1) → reutilizar componente em Phase 4 (US2).

Caso queira parallelism real entre US1 e US2, T013 sai pra Phase 2 (Foundational). Mantive em US1 porque ele faz parte do "primeiro lugar onde o player aparece" e a complexidade é compartilhada.

---

## Parallel Execution Examples

**Foundational (Phase 2)** — rodar em paralelo: T004 (urls.ts) + T005 (urls test) são independentes; depois T006 (deezer.ts) + T009 (Context) podem rodar em paralelo. T007/T008 (actions) tocam o mesmo arquivo (`actions.ts`) — sequenciais.

**US1 (Phase 3)** — após T013 (component): T014/T015 (integração) são sequenciais (mesmo arquivo). T016/T017/T018 (testes) são paralelos.

**Polish (Phase 5)** — T022, T023 são paralelos. T024 (Turso prod) deve rodar antes de T026 (suite passa local; prod só pra liberar deploy depois).

---

## Implementation Strategy

**MVP mínimo recomendado**: Phases 1 + 2 + 3 (US1). Entrega o player na curadoria (caminho mais usado pra triagem). US2 (montagem) pode vir em deploy seguinte se necessário.

**Deliverables incrementais possíveis**:

1. **v0.5 (interno)**: Phase 1+2 — schema, libs, actions, Context. Sem UI ainda. Não shippa.
2. **v1.0 (MVP shipping)**: + Phase 3 (US1). Preview funciona em `/disco/[id]`. Schema aplicado em prod.
3. **v1.1**: + Phase 4 (US2). Preview também em `/sets/[id]/montar`.
4. **release final**: + Phase 5. Quickstart validado, BACKLOG atualizado, lint/typecheck/tests verdes.

**Anti-goals explícitos (não fazer neste round)**:
- YouTube embed inline (incremento futuro separado)
- Spotify Web Playback SDK (decisão arquivada do 004)
- TTL automático de cache
- Volume/scrub além do `<audio>` nativo
- Preview em moods/contexts/comments (não faz sentido)

---

## Test Summary

| Teste | Fase | Cobre |
|---|---|---|
| `preview-urls.test.ts` (T005) | 2 | Encoding correto Spotify/YouTube URLs |
| `preview-resolve-cache.test.ts` (T016) | 3 | Cache hit/miss, invalidate funciona |
| `preview-no-deezer-fallback.test.ts` (T017) | 3 | Marker '' persiste e é cache hit |
| `preview-principio-i.test.ts` (T018) | 3 | **SC-004** — write nunca toca AUTHOR |
| `preview-single-player.test.tsx` (T018a) | 3 | **FR-007** — Context pausa player anterior cross-componente |
| `preview-montar.spec.ts` (T021) | 4 | Skeleton e2e (skip até pipeline pronta) |

---

**Total**: 28 tasks · 3 Setup + 9 Foundational + 7 US1 + 3 US2 + 6 Polish

**Estimativa de esforço** (com IA pair): ~1–1.5 dias de dev focado. Componente `<PreviewControls>` é o trecho mais denso (T013) — ~3-4h pra cobrir todos os 4 estados visuais + race + Context integration.
