# Backlog — Sulco

**Última atualização**: 2026-04-25

Convenção:
- **IDs preservam histórico** (Incremento N, Bug N) — não renumerar quando algo é fechado.
- Status: 🟢 priorizado · 🟡 médio · ⚪ não-priorizado · ✅ entregue · 🔒 fechado sem código

---

## Roadmap

### 🟢 Próximos (semanas)

#### Incremento 5b — Preview de áudio (Deezer + YouTube fallback)
Permitir ouvir 30s das faixas durante montagem do set, inline em
`/sets/[id]/montar`, sem sair do Sulco. Combo:
- **Deezer Public API** (preview_url 30s ainda ativo, sem auth) — drop-in
  do Spotify deprecado
- **YouTube link-out** como fallback universal quando Deezer não acha
- Server Action resolve preview por (artist, title, isrc?), cache em
  `tracks.previewUrl` + `previewUrlCachedAt`
- Botão `▶` inline no `CandidateRow`, `<audio>` nativo (sem SDK embed)

Estimativa: 1-2 dias. Originalmente parte do 004-spotify-audio-hints
(arquivado).

#### Incremento 10 — Curadoria aleatória respeita filtros aplicados
Hoje o botão 🎲 (006, em prod) sorteia entre TODOS os discos `unrated`
não-arquivados. Quando o DJ tem filtro de gênero/estilo ativo na
coleção (ex: `?style=MPB`), faz sentido o aleatório respeitar — sortear
MPB unrated em vez de qualquer disco.

Comportamento desejado:
- Botão 🎲 lê os mesmos searchParams que `<FilterBar>` (status, q,
  bomba, genre[], style[]) e passa pra Server Action
- `pickRandomUnratedRecord` aceita filtros opcionais (mesmos da
  `queryCollection`) e aplica `WHERE` na query do `ORDER BY RANDOM()`
- Se filtro retorna 0 elegíveis: feedback "Nenhum disco unrated com
  esses filtros" (atualizar mensagem do empty state)

Ganho concreto pós-batch 005: filtra "Samba" + click 🎲 → cai num
Caetano enriquecido com BPM/tom já preenchidos. Triagem temática
focada.

Sem schema delta. Esforço: ~30 min. Pode aproveitar pra adicionar o
botão também em `/curadoria` (caso a rota não seja deletada) ou em
qualquer lugar que faça sentido sortear.

Registrado a pedido em 2026-04-25.

#### Incremento 8 — Refatoração UX dos filtros multi-facet (gênero/estilo)
Acervo do Felipe tem 150+ estilos catalogados; quando o DJ expande os
filtros vira parede de chips intransitável. Tentativa de inline-search
foi revertida (ficou ruim visual).

Direções a explorar:
1. **Combobox/popover** (recomendado) — trigger "+ adicionar gênero/estilo"
   abre popover com busca + virtualização + keyboard nav. Padrão Linear/
   Notion/GitHub. Implementação manual (constituição proíbe shadcn).
2. **Drawer lateral** — painel dedicado com todos os filtros agrupados.
3. **Categorização hierárquica** — mapear estilos em famílias.
4. **Search-only radical** — sem lista, só input com sugestões.

Critérios de sucesso: selecionar 1 estilo entre 150 em ≤ 5s, sem inflar
página verticalmente.

Estimativa: 1 dia. Sem schema delta.

---

### 🟡 Médios (próximos meses)

#### Incremento 1 — Briefing com IA
Botão "Sugerir com IA" em `/sets/[id]/montar`:
1. Lê briefing do set
2. Busca faixas selecionadas com metadados
3. Chama Anthropic SDK (`claude-sonnet-4-7`) com prompt estruturado
4. Retorna lista ranqueada com justificativa

Env var nova: `ANTHROPIC_API_KEY`.

**Quando fazer**: depois de ter mais sets criados pra calibrar prompts.

#### Incremento 9 — Batch enrich sob demanda em /conta (multi-user)
Hoje o pipeline 005 on-demand (botão em `/disco/[id]`) já funciona pra
qualquer DJ. Mas acervo recém-importado começa vazio de audio features
e cobertura cresce disco-a-disco — leva semanas.

Solução: botão "🪄 Buscar sugestões pra todo o acervo" em `/conta`. DJ
clica uma vez após onboarding, batch processa em background.

Constraints Vercel Hobby (60s max em Server Actions) tornam síncrono
inviável. Caminhos:
1. **Cron + flag** (recomendado) — coluna `users.enrich_requested_at`,
   cron diário processa users marcados via `enrichUserBacklog` (re-introduzido
   só pra esse caso), limpa flag ao terminar
2. Chunking iterativo — Server Action processa N discos por click
3. Background queue (Inngest/QStash) — overkill pro piloto

Estimativa: meio dia. **Gating: quando 3º DJ entrar no piloto** (com
2 users, batch via `scripts/_enrich-batch.mjs` ad-hoc é viável).

---

### ⚪ Não-priorizados

#### Incremento 2 — PWA / mobile
- `next-pwa` ou manifest manual
- Curadoria adaptada pra mobile (swipe entre cards)
- `/sets/[id]/montar` responsiva

**Quando fazer**: quando houver demanda real de uso mobile.

#### Incremento 3 — Playlists (blocos reutilizáveis)
Schema já existe (`playlists`, `playlist_tracks` com `user_id` FK
CASCADE). Rotas `/playlists*` seguem 404 até produto definir.

**Quando fazer**: se cansar de re-criar mesmo bloco em vários sets.

#### Incremento 4 — Notificações por email (convites + alertas)
Hoje owner adiciona email em `/admin/convites` mas sistema NÃO dispara
email automático — owner compartilha URL manualmente.

Escopo: integrar Resend (ou similar), template pt-BR, opcional alerta
pro owner em eventos relevantes. Env var nova: `RESEND_API_KEY`.

#### Incremento 6 — Fluxo de exclusão de álbum manual
Hoje Sulco só arquiva discos que saíram do Discogs (Princípio IV).
Falta fluxo explícito pro DJ remover manualmente um disco que ele
não quer mais (vendeu, comprou errado, desistiu).

Escopo:
- Botão "Remover da coleção" em `/disco/[id]` na sidebar
- Modal de confirmação exigindo digitar título
- **Decisão pendente**: cascade total (tracks + set_tracks) vs
  preservar em sets finalizados (soft-delete)
- Auditoria em `sync_runs` kind='manual_delete'
- Edge case: avisar se track está em set "em montagem"

Princípio I permanece: ação irreversível, só DJ inicia. Zero impacto
no Discogs.

---

## Bugs

### Abertos

Nenhum no momento.

### Abertos

#### Bug 11 — Primeiro sync manual estoura Vercel timeout (60s) por falta de snapshot anterior
Reportado em 2026-04-25. DJ removeu 5 discos no Discogs e clicou
"Sincronizar agora" em `/sync`. Sync rodou 1m08s e foi morto pelo
`killZombieSyncRuns` (Bug 8 fix) com 0 removidos detectados.

**Causa raiz**: `runIncrementalSync` em `src/lib/discogs/sync.ts:55-66`
busca snapshot anterior **filtrando por mesmo `kind`** (`eq(syncRuns.kind, kind)`):

```ts
const previous = await db
  .select({ snapshotJson: syncRuns.snapshotJson })
  .from(syncRuns)
  .where(and(
    eq(syncRuns.userId, userId),
    eq(syncRuns.kind, kind),    // ← filtro estrito por kind!
    eq(syncRuns.outcome, 'ok'),
  ));
```

Se nunca rodou `manual` com sucesso (caso do Felipe — só tem
`initial_import` e `reimport_record` no histórico ok), `prevIds = []`.
Todos os 100 discos da 1ª página viram "novos" → 100× `fetchRelease()`
× rate limit Discogs ~1 req/s = ~100s → Vercel Lambda timeout em 60s
→ run morre como zombie.

**Cenário**: bug afeta TODA primeira execução manual de qualquer DJ
com acervo grande. Onboarding via initial_import passa, mas quando o
DJ clica "Sincronizar agora" pela primeira vez, trava.

**Fix proposto**: fallback hierárquico de snapshot. Pra `manual`:
1. Procura último ok com kind='manual'
2. Se não acha, fallback pra kind='daily_auto'
3. Se não acha, fallback pra kind='initial_import' (ÚLTIMO snapshot
   completo conhecido do acervo)

Pra `daily_auto`, mesma cadeia (manual ↔ daily_auto são intercambiáveis
porque ambos representam o estado completo do acervo no Discogs).

`reimport_record` continua filtrado separado (snapshot é só do disco
específico, não do acervo).

**Esforço**: ~30 min via speckit.specify dedicado. Sem schema delta.

**Workaround temporário**: pular sync manual; aguardar cron 04:00 SP
diário fazer o trabalho. Cron usa kind='daily_auto' que tem o mesmo
problema na 1ª vez, mas após primeira execução cria snapshot que
serve de base pras seguintes.

**Workaround imediato pros 5 discos**: SQL manual marcando archived
nos IDs específicos. Não recomendado sem identificar quais foram.

### Histórico (fechados)

- **Bug 8** — Sync trava em "em andamento" — ✅ commit `1952d33`
  (`killZombieSyncRuns` passivo no `loadStatusSnapshot`)
- **Bug 8b** — Botão "cancelar" pra sync manual em curso — ✅ Server
  Action `cancelRunningSync` + link "Cancelar sync" no `<ManualSyncButton>`
  quando há run em `running`
- **Bug 9** — Filtros de coleção em estilos/gêneros — 🔒 já existia
  (descoberto em investigação 2026-04-24, `<FilterBar>`)
- **Bug 10** — Curadoria aleatória direto pro disco — ✅ commit `8286226`
  (entregue como Incremento 006 com botão 🎲 na home)

---

## Backlog de ideias

Ideias não-comprometidas. Gating: cada uma precisa virar discussão
estruturada antes de subir pra Roadmap como Incremento numerado.

- **Modo aleatório por gênero** — sortear disco unrated dentro de
  filtro pré-aplicado. Depende de 8 (filtros) + curadoria aleatória
  (006, já em prod).
- **Histórico/anti-repetição na aleatória** — não sortear o mesmo
  disco 2 vezes na mesma sessão.
- **Sincronização reversa MB → Sulco** — quando MB ganhar dado novo
  pra MBID já resolvido, atualizar Sulco passivamente (improvável
  porque AB está congelado em 2022).
- **Auto-tagging por ML local sobre MP3** — DJ aponta pasta com seus
  MP3, ML local extrai BPM/tom/energy real. Resolve gap dos 80% do
  acervo BR sem mapeamento MB. Complexidade alta, depende de bibliotecas
  Python/Rust local; provavelmente fora do escopo Next.js puro.
- **Bulk edit de faixas** — selecionar várias tracks e editar campo
  comum (mood, context, fineGenre) de uma vez.
- **Playlists smart** — playlist gerada por filtro dinâmico ("todas
  as bombas BPM 110-130 com mood `dançante`") em vez de lista estática.

---

## Releases (entregues, em prod)

Histórico de incrementos shipped. Cada um tem `specs/NNN-*/` com
spec/plan/data-model/contracts/quickstart.

- **001** — Sulco piloto single-user · 2026-04-22 · `specs/001-sulco-piloto/`
- **002** — Multi-conta + invite + /admin · 2026-04-23 · `specs/002-multi-conta/`
- **003** — Faixas ricas no /montar · 2026-04-23 · `specs/003-faixas-ricas-montar/`
- **004** — 🚫 Spotify audio hints · ARQUIVADO (API deprecada nov/2024) · `specs/004-spotify-audio-hints-ARQUIVADO/`
- **005** — Audio features via AcousticBrainz · 2026-04-24/25 · `specs/005-acousticbrainz-audio-features/` · ~1200 faixas enriquecidas em prod (~1140 BR após batch fallback artist+title)
- **006** — Curadoria aleatória · 2026-04-24 · `specs/006-curadoria-aleatoria/`

Status detalhado de cada release vive nas specs próprias (commit
references nos commits acima cobrem o histórico de fixes pós-release).
