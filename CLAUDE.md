# CLAUDE.md — Sulco

Guia de contexto para o Claude Code. Leia este arquivo inteiro antes de qualquer ação.

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

## O que ainda não existe (próximos incrementos)

Os incrementos originais 1, 2 e 3 (curadoria sequencial, integração Discogs, e
o piloto completo) foram **implementados em `specs/001-sulco-piloto/`**. Veja
o plan, tasks e checklists lá. Ficam como próximos incrementos:

### Incremento futuro 1 — Briefing com IA
Arquivo: `src/lib/ai.ts` (ainda não criado).

Na tela `/sets/[id]/montar`, botão "Sugerir com IA" que:
1. Lê o briefing do set
2. Busca todas as faixas selecionadas de discos ativos com seus metadados
3. Chama `claude-sonnet-4-7` via Anthropic SDK com prompt estruturado
4. Retorna lista ranqueada de faixas com justificativa

Variável de ambiente: `ANTHROPIC_API_KEY` em `.env.local`.

### Incremento futuro 2 — PWA / mobile
- `next-pwa` ou manifest manual
- Tela de curadoria adaptada para mobile (card por card, swipe)
- Tela de montar set responsiva

### Incremento futuro 3 — Playlists (blocos reutilizáveis)
Atualmente **fora do escopo do piloto** (FR-053a). Schema já tem as tabelas
`playlists` e `playlist_tracks` — agora com `user_id NOT NULL` FK CASCADE
(fechado no 002). Rotas `/playlists*` seguem 404 até haver produto para isso.

### Incremento futuro 4 — Notificações por email (convites + alertas)
Hoje o owner adiciona email em `/admin/convites` mas o sistema NÃO
dispara email automático para o convidado. O owner precisa compartilhar a URL
manualmente (WhatsApp, email pessoal etc.).

Escopo sugerido quando vier a vez:
- Integrar Resend (ou similar) via Server Action ao `addInvite`
- Template simples em pt-BR: "Você foi convidado para o Sulco — acesse `<URL>`"
- Opcional: alerta pro owner quando convidado conclui onboarding ou
  quando algum import trava (observabilidade ativa — hoje explicitamente
  fora do 002 spec)
- Env var nova: `RESEND_API_KEY` (sensitive na Vercel)

Registrado a pedido em 2026-04-23 como follow-up do 002-multi-conta.

### Incremento futuro 5 — Spotify audio hints (BPM/tom/energia + preview)
Arquivo: `src/lib/spotify/` (ainda não criado).

Objetivo: acelerar curadoria de 2500 discos puxando sugestões de BPM,
tom (Camelot), energia via Spotify `audio-features` API, e expor
botão de preview (link-out pro Spotify Web Player).

Escopo sugerido:
- OAuth 2.0 PKCE por user; token cifrado com `MASTER_ENCRYPTION_KEY`
  (mesmo padrão do PAT Discogs)
- Matching Discogs → Spotify album: ISRC quando disponível, fallback
  artist+title+year com top-3 candidates pro DJ escolher
- Faixas auto-linkadas por position+title após match do álbum
- Colunas separadas em `tracks`: `spotify_track_id`, `spotify_bpm`,
  `spotify_key`, `spotify_energy` — **nunca** sobrescrevem campos
  autorais (Princípio I)
- UI `/disco/[id]`: botão "Buscar no Spotify" + sugestões exibidas
  como dica ("Spotify sugere: 120 BPM / 8A / E3") com botão 1-click
  "Usar essa sugestão" que copia pros campos do DJ (ação explícita)
- Preview: botão "▶️ Ouvir" abre `spotify:track:X` em nova aba
  (sem SDK embed pra não exigir Premium)

Env vars novas: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
`SPOTIFY_REDIRECT_URI`.

Fora do escopo mesmo desse incremento:
- Sync automático de audio-features em reimport
- Busca inversa Spotify → Discogs
- Import de playlists Spotify
- Export de sets pra Spotify
- Spotify Web Playback SDK inline

Estimativa: maior que o 002 (~3-4 phases, ~35 tasks); 3-4 dias de
trabalho. Meta: metade do tempo de curadoria pra discos com match.

Registrado a pedido em 2026-04-24.

### Incremento futuro 6 — Fluxo de exclusão de álbum da coleção
Hoje o Sulco só arquiva discos que saíram do Discogs (Princípio IV —
Preservar em vez de destruir). Falta um fluxo explícito pro DJ
**remover manualmente** um disco que ele não quer mais ver, por
qualquer motivo (desistiu, vendeu, comprou errado).

Escopo sugerido:
- Botão "Remover da coleção" em `/disco/[id]`, na sidebar com as
  demais ações de conta (abaixo de "Reimportar este disco")
- Modal de confirmação — tipo o de delete account — exigindo digitar
  o título do disco pra confirmar. Mensagem explícita: "Isso vai
  apagar este disco, todas as faixas e sua curadoria (BPM, tom,
  Bomba, comentários). Set history preservado só se o disco não
  estava em nenhum set finalizado."
- Decisão pra tomar no spec: **cascade delete total** (tracks +
  set_tracks que referenciem) vs **preservar em sets finalizados**
  (mantém track + marca record como soft-deleted)
- Opção "também remover do Discogs" com checkbox? Provavelmente não
  — Sulco não deve mutar o Discogs do DJ sem escopo explícito.
- Se o disco estiver arquivado (veio do Discogs mas foi removido
  de lá), o botão pode ser mais direto ("Apagar permanentemente")
- Auditoria: registrar em `sync_runs` kind='manual_delete' pra
  histórico
- Edge cases: set em andamento ("Montar set") tem track do disco
  → avisar antes de apagar

Princípio I permanece: só o DJ pode iniciar essa ação (soberania),
e a ação é irreversível (cascade). Zero impacto no Discogs do DJ.

Registrado a pedido em 2026-04-24.

### Incremento futuro 7 — Faixas ricas na tela "Montar set"
A tela `/sets/[id]/montar` hoje mostra só metadados básicos por candidata
(artista, título, BPM, tom, energia). Mas é **exatamente no momento de
montar o set** que os campos autorais mais ricos importam: `moods`,
`contexts`, `fineGenre`, `references`, `comment`, `rating`, `shelfLocation`,
`notes` do disco. Hoje o DJ precisa sair dessa tela pra relembrar o que
anotou de cada faixa — quebra o fluxo.

Escopo sugerido:
- Card de faixa candidato expandido por default (ou expansível
  inline): mostrar todos os campos autorais em layout denso mas
  legível, seguindo identidade editorial
- Moods e contexts como chips coloridos/categorizados (consistência
  com `chip-picker`)
- `comment` e `references` em itálico pequeno, destacados visualmente
  (são o que mais ajuda a lembrar "ah, é aquela faixa")
- `fineGenre` como label separada, diferenciada do `genres[]` do
  Discogs
- `shelfLocation` + `notes` do disco (do record, não da track)
  visíveis como contexto da estante onde pegar
- `rating` (+/++/+++) em destaque próximo ao nome — atalho visual
  pra priorizar no olho
- Botão de colapsar/expandir pra quem prefere a visão compacta atual
- Desempenho: verificar se o query de candidatos já traz esses
  campos; se não, expandir `listMontarCandidates` pra incluir

Não-goals neste incremento:
- Edição inline de curadoria aqui (continua sendo em /disco/[id])
- Filtros adicionais além do que já existe (BPM, Camelot, energy,
  rating, moods AND, contexts AND, Bomba, texto)

Esforço: pequeno-médio (1-2 dias). UI-heavy, sem mudança de schema.

Registrado a pedido em 2026-04-24.

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

<!-- SPECKIT START -->
Current active feature: **002-multi-conta**

Authoritative planning artifacts (read these before making changes that
affect the multi-conta rollout):

- Plan: [specs/002-multi-conta/plan.md](specs/002-multi-conta/plan.md)
- Spec: [specs/002-multi-conta/spec.md](specs/002-multi-conta/spec.md)
- Data model: [specs/002-multi-conta/data-model.md](specs/002-multi-conta/data-model.md)
- Contracts: [specs/002-multi-conta/contracts/](specs/002-multi-conta/contracts/)
- Research: [specs/002-multi-conta/research.md](specs/002-multi-conta/research.md)
- Quickstart: [specs/002-multi-conta/quickstart.md](specs/002-multi-conta/quickstart.md)

Prior feature (completed, frozen): **001-sulco-piloto**
- [specs/001-sulco-piloto/](specs/001-sulco-piloto/) — piloto single-user.

Key deltas introduced by 002:
- `users` gains `is_owner` boolean (default false) — primeiro user com
  email igual a `OWNER_EMAIL` e verified vira owner, âncora por
  clerkUserId.
- `playlists` e `playlist_tracks` ganham `user_id NOT NULL` FK
  com `ON DELETE CASCADE`, fechando dívida do audit (mesmo com as
  rotas `/playlists*` seguindo 404).
- Novas rotas: `/admin` (apenas owner — 404 caso contrário) e
  `/convite-fechado` (pública, renderizada após rejeição da Clerk
  Allowlist).
- Env vars novas: `OWNER_EMAIL` (Vercel).
- Signup passa a exigir allowlist no Clerk Dashboard — setup manual
  documentado em [docs/convites.md](docs/convites.md).
<!-- SPECKIT END -->
