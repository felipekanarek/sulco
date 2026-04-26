# Implementation Plan: Preview de áudio (008)

**Branch**: `008-preview-audio-deezer-spotify-youtube` | **Date**: 2026-04-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-preview-audio-deezer-spotify-youtube/spec.md`

## Summary

Botão ▶ inline em `/disco/[id]` e `/sets/[id]/montar` que toca preview
30s do Deezer via `<audio>` nativo. Resolução lazy on-demand via Server
Action `resolveTrackPreview(trackId)` que busca `Deezer Search API`
por `artist + title` e cacheia URL em `tracks.previewUrl`. Botões
secundários sempre visíveis: ↗ Spotify (search URL aberta) e ↗ YouTube
(search URL aberta) — link-out em nova aba. Estado global "1 player
ativo por vez" via React Context. Recuperação reativa de URL morta
via botão "tentar de novo" que invalida cache e refaz busca.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Next.js 15 App Router (RSC) — mesmo stack 001–007.
**Primary Dependencies**: Drizzle ORM + `@libsql/client`, Zod pra Server Actions, Tailwind v3. Sem dependências novas — `<audio>` é built-in do browser, fetch nativo pra Deezer.
**Storage**: SQLite via Turso (libsql). 2 colunas novas em `tracks` aplicadas via `npm run db:push` + ALTER em prod (mesmo padrão 005).
**Testing**: Vitest (unit/integration) + Playwright (e2e skeleton). 3 testes integration críticos (resolve, cache, manual lock pelo Princípio I).
**Target Platform**: Web (Vercel Node 20+). Mesmo runtime dos outros incrementos. Browser moderno com `<audio>` HTML5.
**Project Type**: Web app single project (Next.js).
**Performance Goals**: SC-001 ≤3s primeira reprodução · <500ms cache hit. SC-002 link-out instantâneo. SC-003 ≥70% cobertura Deezer entre faixas dos discos enriquecidos pelo 005.
**Constraints**: Deezer Search API sem auth, sem rate limit documentado mas com Akamai bot-mitigation (User-Agent identificado, sleep 500ms entre calls sequenciais defensivo). Vercel Lambda 60s — Server Action única <2s típica.
**Scale/Scope**: ~26.500 tracks no acervo do Felipe; resolução lazy → Server Action é chamada pontualmente (DJ clica em poucas faixas/sessão). Cache zera custo após 1ª resolução.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Alinhamento com `.specify/memory/constitution.md` v1.0.0:

- **I. Soberania dos Dados do DJ (NON-NEGOTIABLE)** — ✅ Respeitado. `previewUrl` e `previewUrlCachedAt` são campos **write-only do sistema** (FR-014), nunca expostos pra edição. Não tocam nos campos autorais (`bpm`, `musicalKey`, `energy`, `moods`, `comment`, `references`, `fineGenre`, `selected`, `contexts`, `isBomb`, `rating`, `notes`, `shelfLocation`). Schema `tracks` ganha 2 colunas em zona "SYS" claramente separada das autorais.
- **II. Server-First por Padrão** — ✅ Respeitado. Resolução de Deezer feita em `resolveTrackPreview` Server Action (`src/lib/actions.ts`). Player UI em client component (`<PreviewControls>`) pq `<audio>` exige interatividade DOM nativa.
- **III. Schema é a Fonte da Verdade** — ✅ Respeitado. Alterações em `src/db/schema.ts` aplicadas via `npm run db:push` + ALTER prod. Queries com Drizzle builder; sem SQL raw nesta feature.
- **IV. Preservar em Vez de Destruir** — ✅ Respeitado. Zero delete. Cache "indisponível" usa marker (`previewUrl=''`), não null clobber. Invalidação manual via botão "tentar de novo" é ação explícita do DJ.

**Restrições técnicas**: Sem Redux/Zustand (proibido) — estado "1 player por vez" via React Context. Sem novas libs de player (constituição preserva minimalismo). Sem shadcn (idem).

**Conclusão**: passa sem desvios. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/008-preview-audio-deezer-spotify-youtube/
├── plan.md                    # Este arquivo (/speckit.plan)
├── research.md                # Phase 0 (/speckit.plan)
├── data-model.md              # Phase 1 (/speckit.plan)
├── quickstart.md              # Phase 1 (/speckit.plan)
├── contracts/
│   ├── external-apis.md       # Deezer Search + Spotify/YouTube URL templates
│   └── server-actions.md      # resolveTrackPreview + invalidateTrackPreview
├── checklists/
│   └── requirements.md        # ✅ aprovado em /speckit.specify
└── tasks.md                   # Phase 2 (/speckit.tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
sulco/
├── src/
│   ├── lib/
│   │   ├── preview/                    # ← NOVO módulo
│   │   │   ├── deezer.ts               # Cliente: searchTrackPreview(artist, title)
│   │   │   └── urls.ts                 # spotifySearchUrl/youtubeSearchUrl deterministicas
│   │   ├── actions.ts                  # ← ESTENDER: resolveTrackPreview, invalidateTrackPreview
│   │   └── queries/
│   │       └── curadoria.ts            # ← ESTENDER: incluir previewUrl no SELECT do loadDisc
│   ├── components/
│   │   ├── preview-controls.tsx        # ← NOVO client component (botões + audio)
│   │   ├── preview-player-context.tsx  # ← NOVO React Context "1 player por vez"
│   │   ├── track-curation-row.tsx      # ← ESTENDER: monta <PreviewControls> embutido
│   │   └── candidate-row.tsx           # ← ESTENDER: idem
│   ├── app/
│   │   ├── disco/[id]/page.tsx         # já lê tracks via loadDisc; expõe previewUrl no prop
│   │   ├── sets/[id]/montar/page.tsx   # já lê candidates via queryCandidates; idem
│   │   └── layout.tsx                  # ← ESTENDER: <PreviewPlayerProvider> wrapper
│   └── db/
│       └── schema.ts                   # ← ESTENDER: 2 colunas em tracks
└── tests/
    ├── unit/
    │   └── preview-urls.test.ts                # spotifySearchUrl/youtubeSearchUrl encoding
    └── integration/
        ├── preview-resolve-cache.test.ts        # 1ª resolve → cache, 2ª lê do cache
        ├── preview-no-deezer-fallback.test.ts   # Deezer 0 hits → cache marker, link-outs ok
        └── preview-principio-i.test.ts          # SC-004: write nunca toca autorais
```

**Structure Decision**: Projeto único. Feature 008 adiciona módulo `src/lib/preview/` (paralelo ao `src/lib/acousticbrainz/` do 005), 2 client components novos + 1 provider, e estende 5 pontos existentes (schema, actions, curadoria query, candidate-row, track-curation-row, layout). Padrão idêntico aos incrementos anteriores.

## Complexity Tracking

> Preencher apenas se Constitution Check tiver violações justificáveis.

Sem violações. Seção vazia.
