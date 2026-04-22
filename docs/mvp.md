# Sulco — Spec MVP v1

Documento vivo. Foca no **mínimo que entrega valor real de discotecagem** — decidir o que levar em vinil para cada set, a partir de uma coleção curada. UI será refinada depois; este spec é sobre comportamento, regras e escopo.

---

## 1. Visão

> "Meu Discogs, mas para discotecar."

O DJ já tem **o que possui** catalogado no Discogs. O Sulco resolve três coisas que o Discogs não resolve:

1. **Curadoria por faixa** — nem toda faixa de um disco é tocável em set; marcar quais são.
2. **Metadados de pista** — BPM, tom, energia, mood, contexto, avaliação `+ / ++ / +++`.
3. **Montagem de set** — filtrar o universo curado para decidir quais discos entram na bag de um evento específico.

**Usuário-alvo:** Felipe Kanarek. 2500+ discos. Single-user. Sem auth por enquanto.

---

## 2. Fluxos críticos (happy paths)

### Fluxo A — Curar um disco novo
1. DJ coloca disco para tocar em casa
2. Abre `/disco/[id]` (ou `/curadoria` sequencial, quando existir)
3. Marca disco como **Ativo** (entra no universo)
4. Para cada faixa tocável: clica **on**, dá rating (`+ / ++ / +++`), anota BPM / tom / mood / contexto
5. Clica **"Marcar como curado"** → volta para `/?curated=yes`

### Fluxo B — Montar set para um evento
1. Cria set em `/sets/novo` com nome, data, local, briefing
2. Entra em `/sets/[id]/montar`
3. Filtra candidatos por **rating mínimo** (primeiro corte), BPM, energia, mood, contexto
4. Adiciona faixas ao set (painel direito mostra bag física crescer)
5. Finaliza — página de visualização mostra bag com `shelfLocation` para pegar da estante

### Fluxo C — Tocar um disco que nunca foi tocável
1. DJ ouve, decide que não vale a pena
2. Marca como **Descartado** — sai do universo de candidatos mas fica registrado (não deleta)

---

## 3. Escopo MVP v1

### Dentro

- [x] Listagem da coleção com busca e filtros (status + curadoria)
- [x] Página de disco individual com tracklist editável
- [x] Curadoria por faixa: `selected`, `rating` (1–3), BPM, tom, energia, moods[], contexts[], fineGenre, comment, references
- [x] Status do disco: `unrated | active | discarded`
- [x] Flag explícita de curadoria: `curated` + `curatedAt`
- [x] CRUD básico de sets (criar, listar, visualizar, montar)
- [x] Filtros na tela de montagem com ordenação por rating desc
- [x] Bag física derivada (discos únicos + `shelfLocation`)
- [ ] **Integração Discogs** — import inicial + sync diário (bloqueador principal do MVP)
- [ ] **Página `/curadoria` sequencial** — "um disco por vez" com atalhos de teclado
- [ ] **Seed de dados reais** — 2500 discos da collection do Felipe, não os 30 fake

### Fora do MVP (v2+)

- Briefing com IA (Anthropic API) — entra em v1.1
- PWA / mobile / swipe — entra quando o uso em festa começar
- Playlists (blocos reutilizáveis) — schema existe, UI pode esperar
- Multi-user / auth (Clerk) — só se abrir para outros DJs
- Sync multi-device (Turso) — só quando usar em mais de 1 máquina
- Export para Rekordbox / m3u — fora de escopo por ora
- Histórico de onde/quando uma faixa foi tocada

---

## 4. Especificações por feature

### 4.1 Coleção `/`

**Propósito:** visão única, filtrável, da biblioteca inteira.

**Dados exibidos por linha:**
- Capa (placeholder enquanto não há `coverUrl`)
- Artista · Título (itálico, título leva ao disco)
- Selo · Ano · Formato · País
- Estilos (até 3)
- Contagem `X/Y curadas` · shelfLocation
- Badges: Curado/Não curado + Status
- Botão explícito **"Curadoria →"**

**Filtros (query params):**
- `q` — busca livre em artista/título/selo
- `status` — `active | unrated | discarded`
- `curated` — `yes | no`

**Stats do header:** Discos · Curados · Não curados · Faixas selecionadas.

**Regra:** filtros são ortogonais e combináveis via URL. `curated=no` + `status=active` = "discos que entraram no universo mas ainda não curei".

### 4.2 Disco `/disco/[id]`

**Sidebar (sticky):**
- Capa grande
- Artista · Título
- Metadados do Discogs (selo, ano, formato, país, gêneros, estilos, prateleira)
- Botão **Curado / Marcar como curado** (verde quando ativo, com data)
- Botões de status (Ativo / Não avaliado / Descartado)
- Link para Discogs

**Conteúdo principal — tracklist agrupada por lado (A/B/C…):**
Para cada faixa:
- Posição (destacada em vermelho se `selected`)
- Título
- **Rating control `+ / ++ / +++`** sempre visível
- Tags de BPM, tom, energia, mood, contexto, gênero fino
- Comentário (blockquote) e referências (eyebrow)
- `<details>` com formulário de edição completa
- Botão **on/off** para toggle `selected`

**Transições:**
- Clicar em rating igual ao atual limpa (rating = null)
- Toggle de `selected` é independente do rating
- Marcar como curado + não curado → redireciona para `/?curated=yes`
- Marcar como não curado → permanece na página (reabrindo edição)

### 4.3 Sets — lista `/sets`

Grade de cards com: status pill (Rascunho/Agendado/Realizado), data, local, nome, preview do briefing, contagem de faixas e discos.

### 4.4 Novo set `/sets/novo`

Formulário simples: nome (obrigatório), data, local, briefing. Após criar → redireciona para `/sets/[id]/montar`.

### 4.5 Montagem `/sets/[id]/montar`

**Layout:** candidatos à esquerda, set em construção sticky à direita.

**Universo de candidatos:** faixas com `selected = true` **E** `record.status = 'active'`.

**Filtros:**
- **Avaliação mínima** (qualquer / `+` / `++` / `+++`) — filtro primário
- BPM de / até
- Energia (1–5)
- Mood (lista dinâmica)
- Contexto (lista dinâmica)
- Busca livre (título, artista, gênero fino, comentário)

**Ordenação:** `rating DESC, artist ASC` por default. Faixas `+++` sempre no topo.

**Bag física:** contagem de discos únicos (não faixas). Exibe `shelfLocation` quando disponível.

### 4.6 Visualizar set `/sets/[id]`

Briefing + lista de faixas em ordem + bag física com prateleiras. Botão "Editar set" leva para `/montar`.

---

## 5. Modelo de dados (referência rápida)

### records
- Discogs: `discogsId, artist, title, year, label, country, format, coverUrl, genres[], styles[]`
- Autoral: `status, curated, curatedAt, shelfLocation, notes`
- **Regra de sync:** Discogs nunca sobrescreve campos autorais.

### tracks
- Discogs: `position, title, duration`
- Autoral: `selected, rating (1-3), bpm, musicalKey, energy (1-5), moods[], contexts[], fineGenre, references, comment`

### sets + setTracks (N:N com `order`)
- `name, eventDate, location, briefing, status`

### playlists + playlistTracks (N:N com `order`) — schema pronto, UI v2

---

## 6. Estados e transições

### Status do disco
```
unrated ──[avaliar]──► active ──[marcar como curado]──► active + curated
   │                     │
   └──[descartar]──► discarded
```

Regra: `discarded` **pode** ter `curated = true`. Significa "curei e decidi descartar". É informação útil para não reconsiderar.

### Rating da faixa
- `null` (sem avaliação) ↔ `1` (+) ↔ `2` (++) ↔ `3` (+++)
- Clicar no mesmo nível limpa (volta para null)

---

## 7. Integração Discogs — spec

**Endpoint-chave:**
- `GET /users/{username}/collection/folders/0/releases?per_page=100&page=N`
- `GET /releases/{id}` — para tracklist completo
- Header: `Authorization: Discogs token={DISCOGS_TOKEN}`

**Onboarding (primeira vez):**
1. Tela inicial pede username do Discogs (default: `felipekanarek`)
2. Inicia import em background (Server Action que dispara job)
3. UI mostra progresso: `X de 2500 discos importados`
4. Permite navegar enquanto importa (SSE/polling a decidir)

**Rate limit:** 60 req/min autenticado. 2500 discos × 2 requests (release + details) = 5000 reqs ≈ **84 minutos**. Aceitável para import único.

**Sync diário:**
- Busca primeira página por `date_added desc`
- Compara `discogsId` contra banco local
- Insere novos, **nunca sobrescreve campos autorais**
- Se disco some da collection → marca como `archived=true` (schema a adicionar), não deleta

**Reimport manual:** botão na página do disco. Faz só `GET /releases/{id}`, atualiza campos do Discogs (artista/título/selo/ano…), preserva campos autorais (status/curated/rating/selected/etc).

**Tratamento de erros:**
- Rate limit 429 → espera `Retry-After` e retoma
- Disco sem tracklist (comum em edições antigas) → importa sem faixas, permite adicionar manualmente

### Variáveis de ambiente
```
DISCOGS_TOKEN=...
DISCOGS_USERNAME=felipekanarek
```

---

## 8. Critérios de "pronto" para v1

- [ ] Import Discogs da collection real funciona e termina sem erro
- [ ] Todos os 2500+ discos visíveis em `/` com busca funcional
- [ ] Curar 20 discos em sequência no fluxo A sem atrito
- [ ] Criar set e montar com filtro de rating em menos de 2 min
- [ ] Bag física confere com o que está na estante (validação manual)
- [ ] Sync diário roda sem sobrescrever curadoria
- [ ] Backup = copiar `sulco.db` para outro lugar e restaurar funciona

---

## 9. Dívidas técnicas conhecidas

- `.db` no diretório local; sem backup automatizado. Solução v2: job de export diário.
- `cover` é placeholder CSS gradiente — precisa do `coverUrl` do Discogs funcionando.
- `allMoods/allContexts` na tela de montagem escaneia tabela inteira. OK para 2500 discos / ~20k faixas; reavaliar se passar disso.
- Sem transação nas ações de update — baixo risco em single-user mas corrigir antes de v2.
- `formatDate` não considera fuso; eventos sempre locais por enquanto.

---

## 10. Próximas conversas (ordem sugerida)

1. **Discogs integration spec detalhado** — decidir SSE vs polling, idempotência, retry
2. **Página `/curadoria` sequencial** — UX de "um disco por vez" + atalhos
3. **Import real + testes com a collection do Felipe**
4. **Feedback depois de 1 semana de uso real** — ajustar antes de partir para IA/PWA
