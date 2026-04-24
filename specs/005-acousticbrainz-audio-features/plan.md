# Implementation Plan: Audio features via AcousticBrainz (005)

**Branch**: `005-acousticbrainz-audio-features` | **Date**: 2026-04-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-acousticbrainz-audio-features/spec.md`

## Summary

Pré-preencher os campos autorais de audio features (`bpm`, `musicalKey`,
`energy`, `moods`) em `tracks` a partir de dados públicos, respeitando
Princípio I (null-guard no momento da escrita). Resolução canônica via
identificador da release no Discogs → MusicBrainz (descobre MBID da
recording) → AcousticBrainz (busca audio features por MBID).
Distinção entre valor sugerido vs. confirmado é feita por flag única
`tracks.audioFeaturesSource` (`null` / `'acousticbrainz'` / `'manual'`).
Qualquer edição manual em qualquer um dos 4 campos move a flag pra
`'manual'` e trava os 4 contra futuras sugestões. Gatilho duplo: cron
diário existente (backlog) + disparo imediato fire-and-forget após
import/sync (discos novos).

## Technical Context

**Language/Version**: TypeScript 5.x strict, Next.js 15 App Router (RSC) — mesmo stack dos incrementos 001–003.
**Primary Dependencies**: Drizzle ORM + `@libsql/client` (Turso), Zod pra Server Actions, Tailwind v3. Sem dependências novas — fetch nativo pra MusicBrainz/AcousticBrainz.
**Storage**: SQLite (via Turso libsql). Esquema estendido via `npm run db:push` (3 colunas novas em `tracks`).
**Testing**: Vitest (unit/integration), Playwright (e2e). Estrutura já estabelecida em `tests/{unit,integration,e2e,helpers}`. Null-guard coberto por teste de regressão específico (SC-003).
**Target Platform**: Web (Vercel Node.js 20+ runtime). Cron via Vercel Cron já em `vercel.json`.
**Project Type**: Web app single project (Next.js). Sem split backend/frontend.
**Performance Goals**: SC-001 cobertura ≥50% faixas elegíveis. SC-005 primeiro pass do acervo (~2500 discos) em ≤3 execuções do cron diário, ≥200 discos por execução. SC-007 tela de estatísticas <1s p/ 3000 discos. SC-008 zero vazamento cross-user.
**Constraints**: Rate limit MusicBrainz (1 req/s anonymous; até 10 req/s com User-Agent correto), AcousticBrainz (sem limite documentado, mas gentileza = 2 req/s). Sem novos env vars obrigatórios.
**Scale/Scope**: Acervo-alvo ~2500 discos por DJ (Felipe). MVP sem otimização pra múltiplos usuários simultâneos. Crescimento esperado devagar.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Alinhamento com `.specify/memory/constitution.md` v1.0.0:

- **I. Soberania dos Dados do DJ (NON-NEGOTIABLE)** — ✅ Respeitado. Três camadas de defesa: (1) backfill one-shot pré-deploy (T004a) marca toda track com audio features legadas como `'manual'` pra não serem rotuladas como sugestão no primeiro run; (2) cláusula `WHERE audio_features_source IS NULL` exclui tracks `'manual'` do UPDATE do enrich; (3) `COALESCE` por campo mantém valor existente mesmo se a camada 2 falhar. Não toca em `comment`, `references`, `fineGenre`, `selected`, `contexts`, `isBomb`, `rating`. Teste de regressão dedicado (T020 cobre cenários A/B/C; T025 cobre FR-006b + FR-013).
- **II. Server-First por Padrão** — ✅ Respeitado. Todo código novo em `src/lib/acousticbrainz/` é server-only (`import 'server-only'`). Server Action única pra trigger manual (se usada); leitura via RSC. Cron roda em route handler como hoje. Nenhum novo componente cliente além de badge visual (CSS + data-attribute, idealmente sem JS).
- **III. Schema é a Fonte da Verdade** — ✅ Respeitado. Alterações em `src/db/schema.ts` aplicadas via `npm run db:push` antes do código consumidor. Queries usam Drizzle builder; SQL raw apenas pra null-guard de update (documentado inline).
- **IV. Preservar em Vez de Destruir** — ✅ Respeitado. Zero delete na feature. Campos sugeridos são gravados mas não "consomem" slot autoral. Discos arquivados pulados da rotina.

**Restrições técnicas**: Sem Redux/Zustand (não se aplica — tudo server), sem Prisma/better-sqlite3 (stack preservada), sem shadcn (reutiliza primitivas do prototype baseline).

**Conclusão**: passa sem desvios. Nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-acousticbrainz-audio-features/
├── plan.md                         # Este arquivo (/speckit.plan)
├── research.md                     # Phase 0 (/speckit.plan)
├── data-model.md                   # Phase 1 (/speckit.plan)
├── quickstart.md                   # Phase 1 (/speckit.plan)
├── contracts/
│   ├── external-apis.md            # MusicBrainz + AcousticBrainz
│   └── server-actions.md           # Actions deste incremento
├── checklists/
│   └── requirements.md             # Checklist de qualidade da spec
└── tasks.md                        # Phase 2 (/speckit.tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
sulco/
├── src/
│   ├── lib/
│   │   ├── acousticbrainz/         # ← NOVO módulo
│   │   │   ├── index.ts            # Orquestrador (enrichTrack, enrichRecord, enrichUserBacklog)
│   │   │   ├── musicbrainz.ts      # Cliente MB: resolveMbidsForRelease(discogsReleaseId)
│   │   │   ├── acousticbrainz.ts   # Cliente AB: fetchAudioFeatures(mbid)
│   │   │   ├── camelot.ts          # Conversão (key, scale) → Camelot 1A..12A/1B..12B
│   │   │   ├── moods.ts            # Filtro de confiança ≥0.7, seleção de tags
│   │   │   ├── energy.ts           # Derivação de energy 1..5 a partir de AB
│   │   │   └── write.ts            # Null-guard write (UPDATE ... WHERE audioFeaturesSource IS NULL)
│   │   ├── discogs/
│   │   │   └── apply-update.ts     # ← ESTENDER: chama trigger imediato após criar/atualizar faixas
│   │   ├── actions.ts              # ← ESTENDER: edição de bpm/key/energy/moods vira audioFeaturesSource='manual'
│   │   └── queries/
│   │       └── status.ts           # ← ESTENDER: estatísticas agregadas de cobertura
│   ├── app/
│   │   ├── api/
│   │   │   └── cron/
│   │   │       └── sync-daily/
│   │   │           └── route.ts    # ← ESTENDER: após sync, roda enrichUserBacklog(userId)
│   │   ├── disco/
│   │   │   └── [id]/
│   │   │       └── page.tsx        # ← ESTENDER: renderiza badge de origem quando source é externa
│   │   └── status/
│   │       └── page.tsx            # ← ESTENDER: seção "Audio features" com cobertura
│   ├── components/
│   │   └── audio-features-badge.tsx # ← NOVO (server component — sem JS)
│   └── db/
│       └── schema.ts               # ← ESTENDER: 3 colunas em tracks (mbid, audioFeaturesSource, audioFeaturesSyncedAt)
└── tests/
    ├── unit/
    │   ├── acousticbrainz-camelot.test.ts
    │   ├── acousticbrainz-moods.test.ts
    │   └── acousticbrainz-energy.test.ts
    ├── integration/
    │   ├── enrich-null-guard.test.ts                 # SC-003 (regressão Princípio I)
    │   ├── enrich-manual-lock.test.ts                # FR-006b
    │   ├── enrich-multi-user-isolation.test.ts       # SC-008
    │   ├── enrich-backlog-idempotency.test.ts        # FR-015
    │   └── enrich-after-import.test.ts               # FR-018a (trigger imediato)
    └── e2e/
        └── audio-features-badge.spec.ts              # FR-011 (visual)
```

**Structure Decision**: Projeto único (Option 1 do template). Feature 005 adiciona um módulo `src/lib/acousticbrainz/` e estende 4 pontos existentes: schema, `discogs/apply-update.ts`, `actions.ts`, `cron/sync-daily/route.ts`, `app/disco/[id]/page.tsx`, `app/status/page.tsx`, `queries/status.ts`. Nenhum shift arquitetural — segue o padrão já estabelecido pelos incrementos 001–003 (ex: `src/lib/discogs/` como espelho).

## Complexity Tracking

> Preencher apenas se Constitution Check tiver violações justificáveis.

Sem violações. Seção vazia intencionalmente.
