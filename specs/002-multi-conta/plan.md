# Implementation Plan: Multi-conta com signup por convite

**Branch**: `002-multi-conta` | **Date**: 2026-04-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-multi-conta/spec.md`

## Summary

Habilitar 2–5 DJs convidados a usarem o Sulco com contas próprias, sem
permitir signup aberto. **Pivot 2026-04-23**: a ideia original de usar
Clerk Allowlist nativa foi rejeitada após descobrirmos que é feature
Pro (~US$25/mês). Implementamos allowlist própria. Quatro pilares
técnicos:

1. **Tabela `invites`** + coluna `users.allowlisted` + middleware que
   redireciona não-allowlisted para `/convite-fechado`. Clerk signup
   segue aberto; filtragem acontece no Sulco pós-criação do user.
2. **Rota `/admin/convites`** com Server Actions `addInvite` /
   `removeInvite` para o owner gerenciar a allowlist sem sair do app.
3. **Coluna `is_owner`** em `users` + env `OWNER_EMAIL`: primeiro
   usuário que autentica com email verificado igual a `OWNER_EMAIL`
   é promovido a owner via webhook e fica travado via `clerkUserId`.
   Todas as verificações posteriores usam o bit, não o email, fechando
   o vetor de ataque "trocar email no Clerk".
4. **Rota `/admin`** com painel leitura-apenas listando contas, status
   de credencial Discogs, contagem de discos, último sync e flag
   `allowlisted`. Retorna 404 a qualquer visitante não-owner.

Fecha também a dívida do audit do piloto: adiciona `user_id NOT NULL`
+ FK `ON DELETE CASCADE` às tabelas `playlists` e `playlist_tracks`,
preservando isolamento caso rotas `/playlists*` sejam reativadas no
futuro.

Zero mudança na stack (Next 15 + Clerk + Turso + Drizzle), zero
dependência nova, zero custo recorrente adicional — aproveita toda
a base já presente em `001-sulco-piloto`.

## Technical Context

**Language/Version**: TypeScript 5.x em modo strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router + RSC), @clerk/nextjs 7.x
(Allowlist feature + webhook), Drizzle ORM 0.36.x, @libsql/client 0.14,
Zod, Tailwind v3
**Storage**: Turso (libsql remoto) com schema gerido via `drizzle-kit push`
**Testing**: Vitest (unit + integration) com testes focados em isolamento
entre users; Playwright já existente para smoke e-2-e se relevante
**Target Platform**: Vercel Hobby (serverless) + Turso aws-us-east-1
**Project Type**: Web application monolítica (Next.js App Router com RSC
+ Server Actions; sem API REST separada)
**Performance Goals**: `/admin` carrega em <500ms p95 com 5 users; signup
bloqueado redireciona em <200ms; mudanças de schema (`user_id` em
playlists) aplicadas online sem downtime perceptível (tabelas vazias no
piloto)
**Constraints**: Sem domínio próprio (Clerk permanece em test keys
`*.accounts.dev`); sem billing; owner único por instância; stack fixa
da constituição
**Scale/Scope**: 2–5 users simultâneos no piloto; ~2500 discos/user;
uma única rota nova (`/admin`) + uma página (`/convite-fechado`) + 1
migração de schema + 1 Server Action helper (`markOwnerIfFirstLogin`)

## Constitution Check

Referência: `.specify/memory/constitution.md` v1.0.0.

| Princípio | Como o plano se alinha |
|-----------|------------------------|
| **I. Soberania dos Dados do DJ** (NON-NEGOTIABLE) | Plano só toca colunas estruturais (`users.is_owner`) e adiciona `user_id` em `playlists`/`playlist_tracks`. Nenhum campo autoral é escrito ou lido fora do escopo do próprio user. Isolamento por `userId` mantido em todas as queries novas de `/admin`. |
| **II. Server-First por Padrão** | `/admin` e `/convite-fechado` são Server Components puros (apenas leitura). `markOwnerIfFirstLogin` é Server Action invocada pelo webhook Clerk ou por middleware no primeiro login. Zero novos `'use client'`. Nenhuma API route nova. |
| **III. Schema é a Fonte da Verdade** | Mudanças em `src/db/schema.ts`: adicionar `is_owner` em `users` e `user_id` FK em `playlists` + `playlist_tracks`. Queries via Drizzle builder. Aplicação via `npm run db:push`. Sem SQL raw. |
| **IV. Preservar em Vez de Destruir** | Não aplicável diretamente (feature não envolve sync Discogs). A migração de `playlists`/`playlist_tracks` é estruturalmente preserving: tabelas estão vazias no piloto, `ALTER TABLE ADD COLUMN user_id INTEGER NOT NULL` é válido em SQLite vazio; caso contrário precisaria de backfill — será documentado como nota defensiva. |

**Gate**: ✅ sem violações; segue para Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-conta/
├── plan.md              # este arquivo
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — Clerk Allowlist event, /admin page contract
│   ├── clerk-allowlist.md
│   ├── admin-page.md
│   └── convite-fechado-page.md
├── checklists/
│   └── requirements.md  # já criado pelo /speckit.specify
└── tasks.md             # Phase 2 — criado por /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── admin/
│   │   ├── page.tsx              # NOVO — painel leitura-apenas, 404 se !owner
│   │   └── convites/page.tsx     # NOVO — UI de allowlist (add/remove)
│   ├── convite-fechado/
│   │   └── page.tsx              # NOVO — página pt-BR para não-allowlisted
│   ├── api/webhooks/clerk/
│   │   └── route.ts              # MODIFICADO — marca is_owner + allowlisted
│   └── middleware.ts             # MODIFICADO — redireciona não-allowlisted pra /convite-fechado
├── db/
│   └── schema.ts                 # MODIFICADO — users: +is_owner +allowlisted; novo: invites; playlists/playlist_tracks: +user_id
├── lib/
│   ├── auth.ts                   # MODIFICADO — requireOwner() helper + OWNER_EMAIL
│   ├── actions.ts                # MODIFICADO — +addInvite, +removeInvite
│   └── queries/admin.ts          # NOVO — listAllUsers() agregada
└── components/
    └── admin-row.tsx             # NOVO — linha da tabela /admin (presentational)

docs/
└── convites.md                   # NOVO — passo-a-passo pra gerir allowlist via /admin/convites
```

**Structure Decision**: Monolítico Next.js App Router (mesma estrutura
do 001). Sem separação frontend/backend, sem API REST. Adições ficam
co-localizadas no App Router (`src/app/`) e no `src/lib/` existente.
Duas rotas novas leves (`/admin`, `/convite-fechado`), uma migração de
schema, dois pontos de integração com código existente (middleware e
webhook Clerk).

## Complexity Tracking

Sem violações. Tabela abaixo fica vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
