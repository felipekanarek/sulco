# Feature Specification: Tabela de vocabulário dedicada com counters

**Feature Branch**: `028-user-vocab-table`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Inc 33 — Tabela `user_vocab` dedicada (genres/styles/moods/contexts/shelves) com counters incrementais por termo, substituindo as 5 colunas JSON em `user_facets`. Ataca o último gargalo grande de reads identificado em prod: cada edição de moods/contexts em uma track escaneia ~10k tracks pra re-aggregar; cada edição de shelf escaneia ~2.5k records; archive de 1 disco com vocab dispara recompute completo (~60k rows). Pós-Inc 33, edição vira UPSERT direcionado (~5 rows)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ edita vocabulário sem custo proibitivo (Priority: P1)

DJ está em `/disco/[id]` curando uma faixa. Adiciona "solar" ao mood, remove "agitado", adiciona "festa diurna" ao context. Cada toggle dispara um Server Action que persiste a mudança em `tracks.moods`/`contexts` e atualiza o vocabulário materializado do user. Mesma operação em escala (curadoria intensiva — 30 toggles em 10 discos numa sessão de tarde) **não pode** estourar a cota de leituras do banco compartilhado.

**Why this priority**: este é o gargalo mais agressivo identificado pós-Inc 28. Em escala de uso pessoal já consome ~300k reads por sessão de curadoria intensa; em escala 5-10 amigos no free tier vira inviável.

**Independent Test**: Pode ser totalmente testado abrindo `/disco/[id]`, alternando moods/contexts em algumas faixas, e verificando que cada edição consome ≤10 rows lidos no log de instrumentação. Antes do Inc 33, mesma edição consumia ~10k rows.

**Acceptance Scenarios**:

1. **Given** DJ está em `/disco/[id]` com 1 track existente que tem 2 moods, **When** ele adiciona 1 mood novo e remove 1 mood antigo numa única ação, **Then** o vocabulário materializado é atualizado em ≤4 escritas direcionadas (1 increment do novo + 1 decrement do removido + cleanup de zeros) e ZERO leitura de scan agregada.
2. **Given** DJ tem 2500 records e 10000 tracks na coleção, **When** ele edita moods em qualquer track, **Then** custo da operação não escala com tamanho da coleção — fica constante.
3. **Given** DJ edita `shelfLocation` num record (ex: "E1" → "E2"), **When** ação completa, **Then** vocabulário de shelves materializado reflete: "E1" decrementado (e removido se foi a última referência), "E2" incrementado (criado se primeira referência). Sem scan da coleção.

---

### User Story 2 - Filtros de chips refletem vocabulário em uso real (Priority: P1)

DJ vai em `/sets/[id]/montar` e abre o picker de moods pra filtrar candidatos. A lista mostra **apenas moods que têm pelo menos 1 track usando**, ordenados por frequência de uso (mais usados primeiro). DJ que nunca usou "soturno" não vê "soturno" na lista. DJ que removeu o último uso de "festivo" também não vê "festivo".

**Why this priority**: vocab limpo é parte da experiência. Hoje (Inc 28) o vocab vinha de `user_facets.moodsJson` derivado do conjunto geral — funcionava mas tinha drift quando track era removida. Pós-Inc 33, contadores garantem que termos órfãos (ref_count=0) nunca aparecem.

**Independent Test**: Pode ser testado abrindo o picker de moods em `/sets/[id]/montar`, anotando a lista, depois removendo o único uso de algum mood específico via `/disco/[id]`, voltando ao picker e verificando que aquele mood sumiu.

**Acceptance Scenarios**:

1. **Given** DJ tem 3 tracks usando "solar" e abre o picker de moods, **When** lista é renderizada, **Then** "solar" aparece com indicador "3" (ou em posição alta na ordenação por frequência).
2. **Given** DJ remove o último uso de "soturno" (estava em 1 track), **When** ele reabre o picker de moods, **Then** "soturno" não aparece na lista.
3. **Given** DJ adiciona "noir" pela primeira vez em 1 track, **When** ele abre o picker, **Then** "noir" aparece na lista (mesmo com 1 referência).

---

### User Story 3 - Sync e archive mantêm vocabulário consistente (Priority: P2)

Sync diário do Discogs roda e adiciona 5 records novos com `genres`/`styles`. Archive marca 2 records antigos (que tinham moods/contexts/shelves curados) como `archived=true`. O vocabulário materializado reflete as mudanças automaticamente: termos novos aparecem; termos cuja única referência foi arquivada somem do picker.

**Why this priority**: garante que o sistema permanece coerente sem intervenção do DJ. Sync e archive são caminhos críticos do ciclo de vida do disco. Bug aqui faria filtros mostrarem termos órfãos ou esconderem termos legítimos.

**Independent Test**: Pode ser testado disparando sync manual e archive, depois verificando que o picker reflete a nova realidade.

**Acceptance Scenarios**:

1. **Given** sync adiciona 1 record novo com gêneros ["Jazz", "Bossa Nova"], **When** sync completa, **Then** vocab de genres tem "Jazz" e "Bossa Nova" com refs incrementadas (criadas se inéditas).
2. **Given** record com 5 moods, 2 genres e 1 shelf é arquivado, **When** archive completa, **Then** todas as 8 referências de vocab daquele record são decrementadas. Termos cuja única referência era o record arquivado somem do vocabulário.
3. **Given** record arquivado **reaparece** no Discogs (Inc 007), **When** desarquive automático rodar, **Then** referências de vocab são re-incrementadas (estado restaurado).

---

### User Story 4 - Drift residual auto-corrige em 24h (Priority: P3)

Em casos extremos (race entre dois writes simultâneos, edição via SQL direto pra debug, bug latente) o contador pode divergir do estado real (ex: ref_count=5 quando só há 4 tracks usando). Cron noturno re-popula o vocabulário do zero baseado no estado autoritativo de records/tracks, eliminando o drift sem intervenção manual.

**Why this priority**: garantia de integridade de longo prazo. Sem o cron, drift acumularia silenciosamente. Com ele, qualquer divergência é resolvida em ≤24h.

**Independent Test**: Pode ser testado introduzindo drift manual (UPDATE direto em `user_vocab` setando ref_count errado), aguardando o cron diário, e verificando que valores ficam corretos.

**Acceptance Scenarios**:

1. **Given** ref_count de um termo está incorretamente em 10 (real é 7), **When** cron diário roda, **Then** ref_count fica em 7.
2. **Given** termo "obsoleto" tem ref_count=0 mas existe na tabela, **When** cron roda, **Then** entry é removida.

---

### Edge Cases

- **Race em writes concorrentes**: dois Server Actions disparam `applyVocabDelta` ao mesmo tempo no mesmo termo. UPSERT do banco é atômico (`ON CONFLICT DO UPDATE`). Sem race condition em counters.
- **Delta computado errado** (ex: caller esquece de passar `removed`): drift residual é corrigido pelo cron em ≤24h. Sistema continua funcional no intervalo (filtro mostra termo extra ou esconde termo válido temporariamente).
- **Termo com whitespace/casing variante**: vocabulário é case-sensitive e space-sensitive (mesmo padrão atual). DJ digitando "Solar" cria entry diferente de "solar". Decisão consciente — vocabulário canônico via UI é responsabilidade do DJ.
- **Backfill concorrente com edição**: durante backfill em prod, edição do DJ pode rodar em paralelo. Backfill faz `DELETE WHERE user_id=? + INSERT` — se edição pegar o intervalo entre delete e insert, vê vocab vazio temporariamente. Mitigação: backfill rodado em janela de baixo uso (manual, fora do horário de pico).
- **Termo vazio ou null em JSON arrays**: linha defensiva — termos com `length = 0` após trim são ignorados na delta e no backfill.
- **Coleção massiva (10k+ records, 50k+ tracks)**: backfill 1× pode levar minutos. Aceito — operação one-time.
- **Archive de record com tracks vazias** (sem moods/contexts): só decrementa genres/styles do record + shelf se houver. Não tenta decrementar moods/contexts inexistentes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST manter um vocabulário materializado por usuário, organizando todos os 5 tipos de termos (gêneros, estilos, moods, contextos, prateleiras) em estrutura unificada.
- **FR-002**: Cada entrada do vocabulário MUST ter um contador (`ref_count`) refletindo quantas vezes o termo é referenciado no acervo do usuário.
- **FR-003**: Sistema MUST oferecer leitura cacheada por usuário+tipo retornando termos com `ref_count > 0` ordenados por frequência (descendente) com desempate alfabético case-insensitive ascendente.
- **FR-004**: Sistema MUST atualizar o vocabulário via deltas direcionados ao detectar mudança em campos-fonte (moods/contexts em tracks, shelfLocation em records, genres/styles em records via sync).
- **FR-005**: Operação de delta MUST ser idempotente em estrutura: dois increments seguidos do mesmo termo resultam em ref_count = 2; um decrement seguido de um increment retorna ao estado inicial.
- **FR-006**: Decrement que leve `ref_count` a 0 MUST resultar em remoção completa da entry do vocabulário, garantindo que termos órfãos nunca apareçam em listagens.
- **FR-007**: Decrement em termo com `ref_count` já em 0 (caso patológico) MUST não causar valor negativo — clamp em 0.
- **FR-008**: Hook em mudança de moods/contexts numa track MUST disparar delta apenas pros termos efetivamente mudados (diff entre old e new), não revogar e re-criar todos.
- **FR-009**: Hook em mudança de `shelfLocation` num record MUST tratar transições null↔valor corretamente (criação, mudança, remoção total).
- **FR-010**: Hook em sync incremental do Discogs MUST atualizar vocabulário apenas pros campos que sync escreve (genres/styles do record). Campos de curadoria (moods/contexts) permanecem fora do escopo do sync.
- **FR-011**: Archive de record MUST decrementar todas as referências do disco no vocabulário (genres + styles + moods/contexts de cada track + shelf). Desarquive MUST re-incrementar.
- **FR-012**: Sistema MUST oferecer recompute completo do vocabulário do usuário (TRUNCATE + repopulate) acessível via cron diário e durante operações de sync.
- **FR-013**: Recompute completo MUST ser baseado exclusivamente no estado autoritativo de `records` e `tracks` (não-arquivados), garantindo eliminação de drift.
- **FR-014**: Sistema MUST oferecer script de backfill 1× para popular o vocabulário a partir do estado atual do acervo, antes do código novo entrar em produção.
- **FR-015**: Backfill MUST ser idempotente — re-execução produz o mesmo resultado sem efeitos colaterais.
- **FR-016**: Listagens existentes que dependem de vocabulário (`listUserGenres`, `listUserStyles`, `listUserShelves`, `listSelectedVocab`, `listUserVocabulary`) MUST passar a derivar do novo vocabulário materializado, preservando assinaturas externas (callers não mudam).
- **FR-017**: Sistema MUST funcionar corretamente sem perda de funcionalidade observável: chip pickers em todas as telas (`/`, `/sets/[id]/montar`, `/disco/[id]`) MUST continuar populados após o deploy.
- **FR-018**: Helpers anteriores que escaneavam o acervo pra re-agregar (`recomputeVocabularyOnly`, `recomputeShelvesOnly`) MUST ser removidos do código após validação. Helper geral `recomputeFacets` permanece como fallback.
- **FR-019**: Migração e backfill em produção MUST rodar **antes** do deploy de código que consome o novo vocabulário, evitando janela onde chip pickers ficam vazios.
- **FR-020**: Sistema MUST manter isolamento por usuário: vocabulário de um DJ nunca interfere com o de outro (múltiplos usuários no mesmo banco).

### Key Entities

- **Vocabulário do usuário (`user_vocab`)**: estrutura nova materializada. Cada entrada representa um termo específico em um tipo específico (`kind`) para um usuário específico. Atributos:
  - **Usuário** (`user_id`): a quem o termo pertence (cascade delete).
  - **Tipo** (`kind`): qual dimensão de vocabulário — uma de cinco: gêneros, estilos, moods, contextos, prateleiras.
  - **Termo** (`term`): a string em si (case-sensitive, alfabeto livre).
  - **Contador de referências** (`ref_count`): quantas vezes este termo aparece no acervo do usuário (em records/tracks não-arquivados).
  - **Última atualização** (`updated_at`): timestamp da última modificação, útil pra debugging e audit.
  - **Identidade**: combinação `(user_id, kind, term)` é única — não há duplicação.
  - **Visibilidade**: entries com `ref_count = 0` são removidas; só termos em uso aparecem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Edição de `moods` ou `contexts` numa track consome ≤10 rows lidos no banco (vs ~10000 hoje) — redução ≥99%.
- **SC-002**: Edição de `shelfLocation` num record consome ≤10 rows lidos (vs ~2500 hoje) — redução ≥99%.
- **SC-003**: Archive de um record com 5 moods + 2 genres + 1 shelf consome ≤30 rows lidos (vs ~60000 hoje na recompute completo) — redução ≥99%.
- **SC-004**: Sessão típica de curadoria intensa (30 toggles de moods/contexts em 10 discos) consome ≤500 rows totais (vs ~300000 hoje) — redução ≥99.8%.
- **SC-005**: Listagem de chips em qualquer tela renderiza em ≤200ms percebidos pelo usuário, mantendo a paridade com Inc 24+26 (já cached).
- **SC-006**: Após deploy, todos os pickers de moods/contexts/genres/styles/shelves nas telas `/`, `/sets/[id]/montar`, `/disco/[id]` mostram exatamente os mesmos termos que mostravam antes do deploy (verificado manualmente comparando snapshot pre vs post).
- **SC-007**: Drift correction via cron diário rodado 1× num user com 2.5k records elimina divergência detectável em ≤30 segundos.
- **SC-008**: Sistema continua funcional para 5-10 usuários em paralelo no banco compartilhado, dentro da cota gratuita do tier público — confirmado pela soma de reads/dia ficar abaixo do limite mensal dividido por 30.
- **SC-009**: Backfill em produção (1× via script) completa em ≤5 minutos para volume típico (~3k records + ~10k tracks).

## Assumptions

- O banco já está populado e em uso (não é cold-start) — Inc 33 é refator de infraestrutura interna sem mudança de UX observável.
- Vocabulário é case-sensitive e space-sensitive (decisão Inc 24 herdada). Não há canonicalização automática.
- Edições do DJ que tocam vocabulário sempre passam pelas Server Actions documentadas (`updateTrackCuration`, `updateRecordAuthorFields`, `archiveRecord`, etc.) — não há paths externos escrevendo direto.
- Sync incremental do Discogs escreve apenas em `genres`/`styles` de records (campos zona SYS) — moods/contexts de tracks são sempre AUTHOR e nunca tocados por sync.
- Cron diário existente em `/api/cron/sync-daily` continuará rodando e pode ser estendido para chamar o recompute completo no fim.
- Princípio I (Soberania do DJ) preservado: vocabulário materializado é zona SYS derivada — DJ continua escrevendo apenas em campos primários (moods, contexts, shelfLocation, etc.) via UI.
- Ordem de deploy é crítica: `(1) schema delta + (2) backfill em prod + (3) deploy de código`. Inverter (3) antes de (2) faria pickers ficarem vazios.
- Limpeza das colunas JSON antigas em `user_facets` (`genresJson`, `stylesJson`, `moodsJson`, `contextsJson`, `shelvesJson`) fica para um incremento separado posterior — não está no escopo deste pacote, reduz risco.
- Sistema continua escalando para coleções de até ~10k records + ~50k tracks por usuário (escala atual com folga). Otimizações para escalas maiores ficam fora do escopo.
