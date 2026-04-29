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
Current active feature: **017-acknowledge-all-archived** (BACKLOG: Inc 11)

Authoritative planning artifacts (read these before making changes
ao botão "Reconhecer tudo" no header da seção "Discos arquivados"
em `/status`, à Server Action `acknowledgeAllArchived` em
`src/lib/actions.ts`, ou ao componente client
`<AcknowledgeAllArchivedButton>`):

- Plan: [specs/017-acknowledge-all-archived/plan.md](specs/017-acknowledge-all-archived/plan.md)
- Spec: [specs/017-acknowledge-all-archived/spec.md](specs/017-acknowledge-all-archived/spec.md)
- Contracts: [specs/017-acknowledge-all-archived/contracts/](specs/017-acknowledge-all-archived/contracts/)
- Research: [specs/017-acknowledge-all-archived/research.md](specs/017-acknowledge-all-archived/research.md)
- Quickstart: [specs/017-acknowledge-all-archived/quickstart.md](specs/017-acknowledge-all-archived/quickstart.md)

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
