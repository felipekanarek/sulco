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
Current active feature: **010-fix-import-banner-acknowledge**

Authoritative planning artifacts (read these before making changes
ao banner de progresso de import na home, ao retorno de
`getImportProgress` ou ao schema de `users`):

- Plan: [specs/010-fix-import-banner-acknowledge/plan.md](specs/010-fix-import-banner-acknowledge/plan.md)
- Spec: [specs/010-fix-import-banner-acknowledge/spec.md](specs/010-fix-import-banner-acknowledge/spec.md)
- Data model: [specs/010-fix-import-banner-acknowledge/data-model.md](specs/010-fix-import-banner-acknowledge/data-model.md)
- Contracts: [specs/010-fix-import-banner-acknowledge/contracts/](specs/010-fix-import-banner-acknowledge/contracts/)
- Research: [specs/010-fix-import-banner-acknowledge/research.md](specs/010-fix-import-banner-acknowledge/research.md)
- Quickstart: [specs/010-fix-import-banner-acknowledge/quickstart.md](specs/010-fix-import-banner-acknowledge/quickstart.md)

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

Key points of 010 (Bug 13):
- **Schema delta aditivo de 1 coluna**: `users.import_acknowledged_at`
  (timestamp nullable). Sem backfill, sem migração de dados.
- **1 Server Action nova**: `acknowledgeImportProgress` em
  `src/lib/actions.ts`. Sem input, lê `requireCurrentUser`, escreve
  timestamp, `revalidatePath('/')`.
- **`getImportProgress` ganha 2 campos** no retorno: `runStartedAt`
  e `lastAck`. Comportamento existente preservado.
- **`<ImportProgressCard>` decide visibilidade no client** com 3
  condições simples: zero-state preservado, terminal-acked oculta,
  running sem botão fechar, terminal não-acked mostra botão.
- **Princípio I respeitado**: `import_acknowledged_at` é zona SYS
  (não AUTHOR); só o próprio DJ escreve via clique.
- **Pattern reusado**: `users.importAcknowledgedAt` espelha
  `records.archivedAcknowledgedAt` — single-timestamp, comparado
  contra `startedAt` do último run.
- **Sem nova dependência**, sem libs externas. `useTransition` +
  `router.refresh()` no client.
<!-- SPECKIT END -->
