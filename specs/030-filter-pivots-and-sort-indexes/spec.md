# Feature Specification: Filtros multi-select via index + sort indexado

**Feature Branch**: `030-filter-pivots-and-sort-indexes`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Inc 35 — Pivot tables `record_genres`/`record_styles`/`track_moods`/`track_contexts` + indexes pra ORDER BY. Investigação em prod (sessão 2026-05-03 pós-Inc 34) com EXPLAIN QUERY PLAN identificou 4 gargalos materiais — todos relacionados a (a) filtros multi-select expandindo JSON arrays via `json_each` ou (b) ORDER BY em colunas sem index. Inc 35 ataca os 4 num único pacote."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ filtra por gênero/estilo sem custo proibitivo (Priority: P1)

DJ está em `/`, abre o painel de filtros e seleciona "Rock" + "Soul" pra encontrar discos específicos. A página renderiza rápido. Mais importante: o custo invisível dessa filtragem (rows lidas pelo banco) não estoura a cota gratuita do banco compartilhado.

**Why this priority**: este é o load mais frequente da app. Hoje cada filtro consome ~10-15k rows lidas pelo otimizador (mesmo retornando ~30 records). 8-10 filtragens por sessão consomem ~100-150k rows — em uso intenso, estoura cota mensal rapidamente.

**Independent Test**: pode ser testado abrindo `/?genre=Rock&style=Soul`, contando rows lidas via dashboard Turso ANTES vs DEPOIS de 5 loads. Espera-se delta total < 500 rows (vs ~50-75k atual).

**Acceptance Scenarios**:

1. **Given** DJ abre `/` (sem filtro), **When** ele clica num chip de gênero "Rock", **Then** a página filtra os discos correspondentes em ≤500ms; custo ≤ 100 rows lidas.
2. **Given** DJ aplica filtro composto (gênero + estilo + bomba=only + busca textual), **When** página renderiza, **Then** custo total ≤ 200 rows lidas (vs ~25-30k hoje no pior caso).
3. **Given** DJ tem 2588 discos não-arquivados, **When** aplica filtro de gênero, **Then** custo NÃO escala com tamanho da coleção — fica proporcional apenas aos discos que casam o filtro.

---

### User Story 2 - DJ filtra candidatos por mood/context em montar set (Priority: P1)

DJ está em `/sets/[id]/montar` montando um set. Aplica filtro "mood=solar" pra ver apenas faixas marcadas como solares. Filtro retorna em ≤500ms e o custo invisível é proporcional aos resultados.

**Why this priority**: segundo path mais frequente da app. Cada filtro de mood ou context hoje consome ~10k rows lidas. Curadoria intensa (10-20 filtragens por set) consome ~100-200k rows.

**Independent Test**: abrir `/sets/[id]/montar?mood=solar`, contar rows lidas no Turso ANTES vs DEPOIS. Espera-se delta < 500 rows.

**Acceptance Scenarios**:

1. **Given** DJ está em `/sets/[id]/montar`, **When** seleciona um mood do picker, **Then** lista de candidatos atualiza com custo ≤ 100 rows lidas.
2. **Given** DJ aplica filtros compostos (mood + context + BPM range + status), **When** render completa, **Then** custo total ≤ 300 rows lidas.

---

### User Story 3 - Listagem da home não paga sort em memória (Priority: P2)

DJ abre `/` (sem filtro de gênero/estilo) e a listagem ordenada por data de import renderiza sem custo extra de sort. O sistema usa um caminho indexado direto.

**Why this priority**: listagem default é o load MAIS comum (todo refresh, toda navegação). Hoje, mesmo sem filtros, há TEMP B-TREE sort consumindo ~2.5k rows lidas. Em escala 5-10 amigos × 20 loads/dia = ~500k rows desperdiçadas/dia.

**Independent Test**: `EXPLAIN QUERY PLAN` da listagem default deve mostrar uso de index direto pra sort. Sem `USE TEMP B-TREE FOR ORDER BY`.

**Acceptance Scenarios**:

1. **Given** DJ abre `/`, **When** página carrega, **Then** custo é ≤ 200 rows lidas (vs ~2.5k+50 atuais com TEMP B-TREE).
2. **Given** DJ pagina pra page=2, **When** carrega, **Then** mesmo padrão (custo proporcional só ao OFFSET + LIMIT).

---

### User Story 4 - Edições de mood/context continuam rápidas (Priority: P2)

DJ edita moods numa track em `/disco/[id]`. A persistência continua tão rápida quanto antes (≤300ms). Internamente, o sistema atualiza tanto o vocabulário usado quanto o índice auxiliar de filtros, mas a complexidade adicional é invisível pro DJ.

**Why this priority**: garante que ganhos de leitura não venham com custo de escrita. Edições de mood/context são frequentes durante curadoria.

**Independent Test**: editar mood numa track, medir tempo de persist via Network tab. Espera-se ≤300ms percebido. Custo write path: ≤10 rows tocadas (DELETE+INSERT em pivots + delta vocab Inc 33).

**Acceptance Scenarios**:

1. **Given** DJ adiciona 1 mood + remove 1 mood numa track, **When** clica salvar, **Then** persist completa em ≤300ms; índice de filtros refletido na próxima query.
2. **Given** DJ edita pela primeira vez um mood "noir" (que não existia em outras tracks), **When** persist completa, **Then** próximo filtro `?mood=noir` retorna a track imediatamente.
3. **Given** DJ remove o último uso de "soturno" globalmente, **When** próximo filtro `?mood=soturno` é aplicado, **Then** zero resultados retornados.

---

### User Story 5 - Sync incremental e archive mantêm consistência (Priority: P3)

Sync diário do Discogs adiciona records novos ou atualiza genres/styles existentes. Archive marca records como `archived=true`. O sistema mantém o índice de filtros consistente automaticamente — discos novos aparecem nos filtros; discos arquivados desaparecem da listagem default mas o índice não fica corrompido.

**Why this priority**: garante integridade de longo prazo sem intervenção manual. Sync e archive são caminhos críticos do ciclo de vida do disco.

**Independent Test**: disparar sync manual, verificar que records novos aparecem em filtros de gênero. Disparar archive, verificar que disco some da listagem.

**Acceptance Scenarios**:

1. **Given** sync adiciona 1 record com gêneros ["Jazz", "Bossa Nova"], **When** sync completa, **Then** filtro `?genre=Jazz` inclui o novo record.
2. **Given** record "X" tem gêneros ["Rock"] e Discogs atualiza pra ["Rock", "Punk"], **When** sync incremental roda, **Then** filtro `?genre=Punk` passa a incluir record X; filtro `?genre=Rock` continua incluindo.
3. **Given** record com 2 gêneros é arquivado, **When** archive completa, **Then** filtro `?genre=...` não retorna mais o record (filtro base já tem `archived=0`).

---

### Edge Cases

- **Migration aplicada antes do code deploy + backfill incompleto**: filtros multi-select retornariam 0 records temporariamente. Mitigação: ordem crítica é (1) migration → (2) backfill → (3) deploy. Gate verificável antes do push.
- **Record com array de gêneros vazio (`[]`)**: zero entries no índice de filtros — comportamento correto. Filtros não retornam o disco.
- **Termo com whitespace ou case variante**: índice case-sensitive e space-sensitive (mesmo padrão Inc 33). "Rock" e "rock" são entries distintas.
- **Race entre sync e edição manual**: sync atualiza genres/styles (DISCOGS), edição manual atualiza moods/contexts (AUTHOR) — domínios disjuntos, sem conflito.
- **Concurrent backfill com edição em prod**: backfill faz `DELETE WHERE record_id=? + INSERT N`. Janela curta entre delete e insert pode resultar em filtro retornando 0 temporariamente pra discos sendo backfilled. Mitigação: rodar em janela de baixo uso.
- **Track removida via sync (conflict=true)**: track continua no índice de filtros até DELETE físico. Aceitável — filtros em `/montar` já têm `WHERE conflict=0` ou `selected=1` que descarta.
- **Index ORDER BY com coluna nullable (archived_at)**: discos não-archived têm `archived_at=NULL`. Index suporta NULLs. Filtro `WHERE archived=1` antes do ORDER BY garante seleção correta.
- **Reaparição de record archived → não-archived (Inc 7)**: hook em `applyDiscogsUpdate` re-INSERT entries do pivot.
- **Volume escalando**: schema suporta 10k+ records / 50k+ tracks com mesma performance (lookups indexados são O(log N)).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST manter um índice auxiliar de gêneros, estilos, moods e contextos materializado em estruturas relacionais — uma entrada por (item, valor).
- **FR-002**: Cada entrada do índice de gêneros e estilos MUST estar associada a um disco específico via chave de referência. Cada entrada de moods e contextos MUST estar associada a uma faixa específica.
- **FR-003**: Sistema MUST oferecer pesquisa rápida (≤100 rows lidas) de "quais discos contêm gênero X" e "quais faixas contêm mood Y".
- **FR-004**: Sistema MUST atualizar o índice automaticamente quando metadados de disco (gêneros/estilos via sync Discogs) ou de faixa (moods/contextos via curadoria do DJ) mudam.
- **FR-005**: Atualização do índice MUST ser via deltas direcionados (DELETE removidos, INSERT novos) baseado em diff entre estado anterior e novo.
- **FR-006**: Insert de disco novo (sync) MUST popular o índice de gêneros/estilos imediatamente.
- **FR-007**: Update de disco existente (sync) MUST aplicar diff entre gêneros/estilos antigos e novos no índice.
- **FR-008**: Reaparição de disco arquivado (sync detecta retorno) MUST re-popular entries do índice.
- **FR-009**: Edição manual de moods/contexts numa faixa pelo DJ MUST aplicar diff entre old e new no índice de faixas.
- **FR-010**: Quando disco é arquivado, NÃO é necessário tocar o índice — filtros já têm `WHERE archived=0` na query base de discos. Quando disco é deletado fisicamente (raríssimo), índice é limpo automaticamente via cascade FK.
- **FR-011**: Filtros multi-select de gênero, estilo, mood e contexto na UI MUST passar a usar o novo índice em vez de expandir arrays JSON em runtime.
- **FR-012**: Listagem default da home (`/`) ordenada por data de import MUST usar caminho indexado direto, sem ordenação em memória.
- **FR-013**: Listagem de discos arquivados (`/status`) ordenada por data de archive MUST usar caminho indexado direto.
- **FR-014**: Sistema MUST oferecer script de backfill 1× para popular o índice a partir do estado atual (gêneros/estilos de records + moods/contextos de tracks).
- **FR-015**: Backfill MUST ser idempotente — re-execução produz o mesmo resultado.
- **FR-016**: Migração e backfill em produção MUST rodar **antes** do deploy de código que consome o novo índice. Inversão temporariamente faria filtros retornarem zero resultados.
- **FR-017**: Sistema MUST manter feature isomórfica — comportamento observável pelo DJ é exatamente o mesmo antes e depois (mesmos discos retornados nos mesmos filtros, mesma ordem de apresentação).
- **FR-018**: Sistema MUST manter isolamento por usuário: discos e faixas pertencem a usuário específico via chaves de referência transitivas (record → user, track → record → user).
- **FR-019**: Hook em writes (sync incremental + edição manual) MUST adicionar overhead controlado (≤10 rows escritas por edição), preservando responsividade da UI.
- **FR-020**: Reversão MUST ser viável via revert de código + DROP TABLE dos índices auxiliares + DROP INDEX dos indexes de ordenação.

### Key Entities

- **Índice de gêneros do disco**: estrutura nova materializada, uma entrada por par (disco, gênero). Atributos:
  - **Disco** (referência via chave): a quem o gênero pertence.
  - **Gênero** (texto): valor do gênero, case-sensitive.
  - **Identidade**: combinação `(disco, gênero)` é única.
  - **Cascade**: cascade ON DELETE — se disco é fisicamente deletado, entradas somem.

- **Índice de estilos do disco**: análogo ao de gêneros, uma entrada por par (disco, estilo).

- **Índice de moods da faixa**: estrutura nova materializada, uma entrada por par (faixa, mood). Atributos:
  - **Faixa** (referência via chave): a quem o mood pertence.
  - **Mood** (texto): valor do mood, case-sensitive.
  - **Identidade**: `(faixa, mood)` única.
  - **Cascade**: cascade ON DELETE em faixa.

- **Índice de contextos da faixa**: análogo ao de moods, uma entrada por par (faixa, contexto).

- **Index de ordenação por data de import**: estrutura interna do banco que cobre filtro composto `(usuário, arquivado, data de import descendente)` permitindo apresentação ordenada sem sort em memória.

- **Index de ordenação por data de archive**: análogo, cobre filtro `(usuário, arquivado, data de archive descendente)` na tela de status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após o deploy, filtro de gênero único (`/?genre=Rock`) consome ≤ 100 rows lidas pelo banco por load — redução ≥ 99% em relação ao baseline pré-Inc 35 (~10-15k rows).
- **SC-002**: Filtro composto de gêneros + estilos + bomba + busca textual consome ≤ 300 rows lidas — redução ≥ 99% em relação ao baseline pior caso (~25-30k rows).
- **SC-003**: Filtro de mood ou context em `/sets/[id]/montar` consome ≤ 100 rows lidas — redução ≥ 99% (~10k → ~50).
- **SC-004**: Listagem default da home (sem filtros multi-select) consome ≤ 200 rows lidas (vs ~2.5k atual com sort em memória).
- **SC-005**: Sessão de uso típico (10 ações de filtragem variadas em uma rota) consome ≤ 1.000 rows lidas total (vs ~150.000 baseline).
- **SC-006**: Edição de moods/contextos numa faixa persiste em ≤ 300ms percebidos pelo DJ — overhead do índice é invisível.
- **SC-007**: Após o deploy, todos os filtros retornam exatamente os mesmos discos/faixas que retornavam antes do deploy. Verificado via comparação manual em rotas-chave.
- **SC-008**: Sistema continua funcional escalando 5-10 usuários simultâneos no banco compartilhado — soma diária de rows lidas ≤ 50.000 (vs > 200.000 baseline com filtros ativos).
- **SC-009**: Build TypeScript passa zero erros após refator das queries.
- **SC-010**: Backfill em produção completa em ≤ 10 minutos para volume típico (~3k discos + ~10k faixas).

## Assumptions

- O banco já está populado e em uso (não cold-start) — Inc 35 é refator de infraestrutura interna sem mudança de UX observável.
- Inc 32 (search text materializado), Inc 33 (vocabulário materializado) e Inc 34 (cleanup user_facets) já estão deployados em produção.
- Vocabulário (counts de termos pra pickers) continua usando estrutura introduzida em Inc 33 — Inc 35 NÃO duplica nem substitui.
- Termos do índice são case-sensitive e space-sensitive (decisão herdada Inc 33).
- Edições do DJ que tocam moods/contextos sempre passam pela Server Action documentada — não há paths externos.
- Sync incremental do Discogs escreve apenas em gêneros/estilos de records — moods/contextos de faixas são AUTHOR e nunca tocados por sync.
- Archive não toca o índice — filtros base de listagem já filtram archived; "vazamento" de IDs archived no índice é aceitável.
- Cron diário existing continua corrigindo drift residual via recompute completo (Inc 33 path) — Inc 35 não adiciona caminhos próprios de drift.
- Ordem de deploy é crítica: (1) migration + backfill antes de (2) deploy de código.
- Sistema continua escalando para coleções de até ~10k discos + ~50k faixas com mesma performance (lookups indexados O(log N)).
- Reversão via revert de código + DROP TABLE × 4 + DROP INDEX × 2 é aceitável caso problema apareça no smoke.
- Inc 36 (busca textual via FTS5) fica fora desse escopo — incremento separado posterior se ainda houver gargalo de busca textual.
