# Implementation Plan: Sulco — Piloto do Produto Completo

**Branch**: `001-sulco-piloto` | **Date**: 2026-04-22 (Plan) / 2026-04-23 (Post-checklist update) | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-sulco-piloto/spec.md`

> **Post-checklist update (2026-04-23)**: Após revisão via `/speckit-checklist`
> (ver [checklists/review.md](checklists/review.md), 60/60 itens fechados), o
> spec foi refinado sem alterações estruturais deste plano. Incorporações:
>
> - **Novos FRs (12)**: FR-017d (limites 5000 chars em notes/briefing/comment/
>   references/fineGenre), FR-020a (apagar valor = null), FR-020b (`curated` /
>   `curatedAt` em `records`), FR-020c (`rating` 1–3 em `tracks`), FR-029a
>   (limite 300 faixas/set), FR-049a (a11y verificada manualmente, sem CI
>   gate), FR-050 (ordem do onboarding), FR-051 (mensagens de erro por ponto
>   de falha no onboarding), FR-052 (retry manual se Discogs off), FR-053
>   (trocar PAT durante sync não aborta), FR-053a (rotas `/playlists` →
>   404), FR-054 (teste CI obrigatório para Princípio I).
> - **Campos novos no data-model** (já refletidos em [data-model.md](data-model.md)):
>   `records.curated`, `records.curatedAt`, `tracks.rating`,
>   `syncRuns.snapshotJson`.
> - **SC removido**: SC-005 (era indicador de uso, não requisito).
> - **Schema vs. data-model**: `src/db/schema.ts` atual diverge do data-model
>   em vários pontos (sem `users`; `records.discogsId UNIQUE global` em vez
>   de `(userId, discogsId)`; sem `isBomb`/`conflict`/`syncRuns`; `sets.status`
>   persistido; etc.). **Alinhar o schema é a primeira task do implement.**
>   Campos `records.curated`/`curatedAt` e `tracks.rating` que já existem no
>   schema são mantidos (promovidos a FR-020b/020c).
> - **Contratos atualizados**: [server-actions.md](contracts/server-actions.md)
>   incorporou `rating`, `curated`, limites de texto, limite de 300 faixas;
>   [discogs-client.md](contracts/discogs-client.md) usa `snapshotJson` para
>   detecção de remoções em `runDailyAutoSync`.
> - **Constitution Check**: reavaliado, continua PASS; FR-054 vira uma task
>   de suíte de testes obrigatória para garantir Princípio I.

## Summary

Entregar o piloto completo do Sulco (Next.js 15 / App Router / RSC) para um DJ
autenticado via Clerk: importar coleção Discogs em background, triar e curar discos
e faixas (com flag Bomba), montar sets por filtros AND sobre faixas selecionadas,
derivar bag física, sincronizar diariamente via cron server-side preservando campos
autorais. Credencial Discogs (PAT) cifrada at-rest; deleção de conta em cascata;
status de set derivado de `eventDate` em `America/Sao_Paulo`; WCAG 2.1 AA mínimo.
Implementação encaixa na Constituição: Drizzle/SQLite como schema único, Server
Actions para mutações, RSC por default.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, Node.js 20+
**Primary Dependencies**:
- Next.js 15 (App Router + RSC)
- Clerk (`@clerk/nextjs`) para autenticação e webhooks
- Drizzle ORM + `@libsql/client` (SQLite em dev; libsql/Turso em prod)
- Zod para validação de Server Actions
- Tailwind CSS v3 + CSS variables (sem shadcn)
- `lucide-react` para ícones
- `@dnd-kit/core` + `@dnd-kit/sortable` para reordenação (drag-and-drop com
  teclado embutido)
- Cron nativo do Vercel (`vercel.json` com `crons:`) para sync diário
- `undici`/`fetch` nativo para chamar a API do Discogs
- `node:crypto` (AES-256-GCM) para cifrar o PAT at-rest

**Storage**:
- Dev: SQLite local (`sulco.db`) via `@libsql/client` file URL
- Prod: Turso (`@libsql/client` com `url` + `authToken`)
- Schema em `src/db/schema.ts` (Drizzle); migrações via `drizzle-kit push`

**Testing**:
- Vitest + `@vitest/ui` para testes unitários e de integração
- Playwright para smoke e2e dos fluxos principais (onboarding, triagem,
  montagem, sync)
- Testes de integração de sync rodam contra SQLite em memória e mock do Discogs

**Target Platform**: Web desktop-first. Node 20 no servidor (Vercel Edge/Serverless
não se aplica porque o cron e o libsql client precisam do runtime Node completo).

**Project Type**: Single web app (monólito Next.js); sem frontend/backend separados.

**Performance Goals**:
- Import de 2500 discos ≤ 45 min respeitando 60 req/min (FR-031, SC-002)
- Triagem: transição disco-a-disco < 1s (SC-004)
- Sync diário ≤ 1 min em coleção estável (SC-009)
- Listagem paginada rende ≤ 300 ms server-side para 3000 discos

**Constraints**:
- Single-user por sessão; "último a salvar vence" em mutações individuais
- Desktop-first; mobile não bloqueante mas sem tratamento específico
- WCAG 2.1 AA em contraste + foco visível + ARIA em toggles
- pt-BR hard-coded; `eventDate` exibido e comparado em `America/Sao_Paulo`,
  armazenado em UTC
- Campos autorais NEVER sobrescritos por sync (Princípio I da Constituição)

**Scale/Scope**:
- 1 usuário pessoal no piloto (Felipe Kanarek) com potencial de crescer para SaaS
- Coleção alvo: 2500 discos (~30 faixas/disco = ~75k tracks)
- 4 US prioritárias (P1–P4), 49 FRs (FR-001..FR-049 + sub)
- 10 rotas Next.js (/, /curadoria, /disco/[id], /sets, /sets/novo,
  /sets/[id], /sets/[id]/montar, /conta, /conta/apagar, /status)

## Constitution Check

*GATE: Deve passar antes de Phase 0. Re-verificado após Phase 1.*

Princípios (Sulco Constitution v1.0.0):

### I. Soberania dos Dados do DJ (NON-NEGOTIABLE)

- ✅ Sync/reimport escrevem apenas em colunas do Discogs; campos autorais nunca são
  tocados. Enforced em `src/lib/discogs/sync.ts` e coberto por teste de integração
  SC-008.
- ✅ Deleção de conta (FR-042) é a ÚNICA porta pela qual dados autorais somem;
  é sempre iniciada pelo usuário (botão ou webhook Clerk que reflete ação do
  usuário no dashboard).
- ✅ Conflitos (FR-037a) preservam campos autorais por default.

**Status**: PASS.

### II. Server-First por Padrão

- ✅ Todas as páginas são RSC; componentes client existem somente para
  interações (drag-and-drop, chip picker, toggle Bomba, filtro montagem).
- ✅ Mutações vivem em `src/lib/actions.ts` (Server Actions) com Zod.
- ✅ Sem `/api/*` para operações que possam ser Server Action. Webhook Clerk e
  endpoint de cron são exceções justificadas (ver Complexity Tracking).

**Status**: PASS (com exceções documentadas).

### III. Schema é a Fonte da Verdade

- ✅ Um único `src/db/schema.ts` (Drizzle) define users, records, tracks, sets,
  setTracks, syncRuns. `playlists` existentes no schema saem de escopo do piloto
  mas não são removidas para evitar migrations destrutivas.
- ✅ Queries via query builder; SQL raw apenas para agregações de bag física se
  necessário.

**Status**: PASS.

### IV. Preservar em Vez de Destruir

- ✅ FR-036: disco arquivado, nunca deletado.
- ✅ FR-037a/b: faixa em conflito preserva campos; "Descartar" exige ação
  explícita do DJ.
- ✅ FR-042/043: hard-delete de conta exige confirmação explícita (digitar
  APAGAR ou email) — ação do usuário, não sistema.

**Status**: PASS.

### Restrições Técnicas

- ✅ Next.js 15 App Router, TypeScript strict, Drizzle + libsql, Zod, Tailwind.
- ✅ Sem Redux/Zustand, sem Prisma, sem better-sqlite3, sem shadcn.
- ⚠️ Adições: Clerk (auth), @dnd-kit (drag-and-drop). Nenhuma viola proibições
  — ampliam a stack sem substituir componentes fundamentais.

**Status**: PASS.

**Constitution Check inicial: PASS.** Reavaliado após Phase 1 (ver final deste
documento).

## Project Structure

### Documentation (this feature)

```text
specs/001-sulco-piloto/
├── plan.md              # este arquivo
├── research.md          # Phase 0 (neste run)
├── data-model.md        # Phase 1 (neste run)
├── quickstart.md        # Phase 1 (neste run)
├── contracts/           # Phase 1 (neste run)
│   ├── server-actions.md
│   ├── discogs-client.md
│   ├── cron-endpoint.md
│   └── clerk-webhook.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (gerado por /speckit-tasks depois)
```

### Source Code (repository root)

Single web app Next.js 15 (não há backend separado). Estrutura concreta no
piloto (ajuste incremental sobre o já existente em `sulco/src/`):

```text
sulco/
├── src/
│   ├── app/                         # App Router (RSC por default)
│   │   ├── layout.tsx               # header com SyncBadge + ApagarConta link
│   │   ├── page.tsx                 # / coleção com filtros AND
│   │   ├── globals.css              # tokens CSS + reset (WCAG AA)
│   │   ├── curadoria/page.tsx       # triagem sequencial
│   │   ├── disco/[id]/page.tsx      # detalhe + curadoria de faixas
│   │   ├── sets/page.tsx            # lista de sets (status derivado)
│   │   ├── sets/novo/page.tsx       # criação de set
│   │   ├── sets/[id]/page.tsx       # visualização + bag física
│   │   ├── sets/[id]/montar/page.tsx # montagem com filtros AND persistidos
│   │   ├── status/page.tsx          # painel Status de sincronização
│   │   ├── conta/page.tsx           # perfil DJ + PAT Discogs + apagar
│   │   ├── onboarding/page.tsx      # pós-sign-up: username + PAT + start import
│   │   ├── api/
│   │   │   ├── webhooks/clerk/route.ts     # webhook user.deleted
│   │   │   └── cron/sync-daily/route.ts    # Vercel Cron → sync diário
│   │   └── sign-in/[[...rest]]/page.tsx    # Clerk UI
│   ├── components/                  # componentes reutilizáveis
│   │   ├── bomba-filter.tsx         # tri-estado (qualquer/apenas/sem)
│   │   ├── chip-picker.tsx          # moods/contexts com autocomplete
│   │   ├── camelot-wheel.tsx        # picker visual de musicalKey
│   │   ├── sync-badge.tsx           # badge no header (FR-041)
│   │   ├── sortable-list.tsx        # dnd-kit + teclado para setTracks
│   │   └── discogs-credential-banner.tsx  # FR-045
│   ├── db/
│   │   ├── schema.ts                # fonte da verdade (ajustado no plano)
│   │   ├── index.ts                 # cliente libsql singleton
│   │   └── seed.ts                  # 30 discos + 10 moods + 8 contextos
│   ├── lib/
│   │   ├── actions.ts               # todas as Server Actions
│   │   ├── auth.ts                  # helpers getCurrentUser() etc.
│   │   ├── crypto.ts                # AES-256-GCM para PAT Discogs
│   │   ├── tz.ts                    # helpers America/Sao_Paulo + derivação status set
│   │   ├── utils.ts                 # cn(), formatDate()
│   │   └── discogs/
│   │       ├── client.ts            # fetch autenticado + rate-limit
│   │       ├── import.ts            # initial import job
│   │       ├── sync.ts              # daily + manual sync
│   │       └── reimport.ts          # single record reimport + cooldown
│   └── middleware.ts                # Clerk middleware (rotas protegidas)
├── drizzle.config.ts
├── tailwind.config.ts
├── vercel.json                      # cron diário → /api/cron/sync-daily
├── .env.example
└── tsconfig.json
```

**Structure Decision**: Monólito Next.js (Option 1: Single project). Webhook Clerk
e endpoint de cron existem como rotas `/api/*` excepcionais porque (a) webhook
tem autenticação HMAC própria da Clerk que não encaixa em Server Action, (b)
Vercel Cron exige endpoint HTTP invocável. Ambas vão em Complexity Tracking.
Diretórios já existem parcialmente; o plano adiciona `components/`, `middleware.ts`,
`app/api/`, `app/onboarding/`, `app/status/`, `app/conta/`, `lib/crypto.ts`,
`lib/auth.ts`, `lib/tz.ts`, `lib/discogs/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `app/api/webhooks/clerk/route.ts` quebra "Server Actions em vez de API routes" (Princípio II) | Webhook externo da Clerk exige endpoint HTTP público com verificação HMAC; Server Actions só são invocáveis pelo framework Next via form/RPC interno | Simular webhook via polling quebraria FR-042 (hard-delete imediato por sinal externo) e gastaria requisições desnecessárias |
| `app/api/cron/sync-daily/route.ts` quebra Princípio II pelo mesmo motivo | Vercel Cron só invoca endpoint HTTP; precisa ser acessível fora de ação do usuário | Trigger client-side na app já foi rejeitado em Q1 da sessão 1 (sync deve rodar mesmo com DJ offline) |
| Adição de Clerk (não proibido, mas expande a stack) | FR-002, FR-042 (webhook), FR-044..FR-046 — auth era "nenhuma" no CLAUDE.md original e a clarificação Q5/sessão 1 fixou Clerk | NextAuth foi explicitamente considerado e rejeitado na mesma sessão; auth própria sai do escopo do piloto |
| Adição de `@dnd-kit` | FR-026 exige drag-and-drop + fallback por teclado; implementar DnD acessível do zero é alto custo e risco | HTML5 DnD API nativo não tem fallback keyboard pronto nem ARIA adequado |
| Manter tabelas `playlists`/`playlistTracks` no schema apesar de fora do escopo | Piloto explicitamente exclui Playlists; remover tabelas exige migration destrutiva que atrapalharia rollback | Tabelas vazias não consomem nada; removê-las depois é trivial quando Playlists for reavaliado |

## Phase 0 — Research

Ver [research.md](research.md). Todos os NEEDS CLARIFICATION foram resolvidos
durante as 5 sessões de `/speckit-clarify`. Pesquisa técnica focou em:

1. Execução de cron no Vercel para Next.js 15
2. Biblioteca de drag-and-drop acessível
3. Estratégia de cifrar PAT at-rest com rotação futura possível
4. Clerk webhooks: verificação HMAC + `user.deleted`
5. Rate-limiting do Discogs: detecção 429 + backoff com progresso resumível

## Phase 1 — Design & Contracts

Ver:

- [data-model.md](data-model.md) — todas as entidades, regras, transições,
  índices e constraints.
- [contracts/server-actions.md](contracts/server-actions.md) — assinaturas
  Zod-validadas de cada Server Action em `src/lib/actions.ts`.
- [contracts/discogs-client.md](contracts/discogs-client.md) — interface do
  cliente Discogs e pontos de falha tratados.
- [contracts/cron-endpoint.md](contracts/cron-endpoint.md) — contrato do
  endpoint `/api/cron/sync-daily`.
- [contracts/clerk-webhook.md](contracts/clerk-webhook.md) — contrato do
  endpoint `/api/webhooks/clerk`.
- [quickstart.md](quickstart.md) — setup local, smoke test e rota feliz
  passo-a-passo.

Agent context (`CLAUDE.md`) atualizado: bloco entre `<!-- SPECKIT START -->` e
`<!-- SPECKIT END -->` agora aponta para `specs/001-sulco-piloto/plan.md`.

### Constitution Check (pós-Phase 1): PASS

Re-avaliando após produzir os artefatos de design:

- **Soberania dos Dados (I)**: reafirmada em data-model.md (colunas autorais
  marcadas explicitamente) e em contracts/discogs-client.md (função
  `applySyncUpdate` só toca colunas do Discogs).
- **Server-First (II)**: todos os contratos estão em Server Actions, exceto os
  dois endpoints `/api/*` listados em Complexity Tracking.
- **Schema (III)**: data-model.md corresponde 1:1 a `src/db/schema.ts`
  (Drizzle); zero drift entre spec e código.
- **Preservar (IV)**: contratos definem `archiveRecord`, `flagTrackConflict`,
  `resolveTrackConflictKeep|Discard` — deleção só com consentimento explícito.

Nenhum gate reverteu.
