# Feature Specification: Otimização de leituras Turso (cota estourada)

**Feature Branch**: `022-turso-reads-optimization`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Inc 23 — cota Turso estourada hoje. Pacote consolidado: revert parcial Inc 21 + cache layer + 2 índices. Reduz row reads sem mudar UX."

## Clarifications

### Session 2026-04-30

- Q: Cachear também `queryCollection` (a query mais cara, ~12.5k reads)? → A: **Sim, incluir** com cache key composto absorvendo todos os filtros (status, text, genres, styles, bomba) + tag por user (`['user', userId]`). Tag invalida todas as variantes do user simultaneamente quando o DJ escreve. Aceita-se fragmentação de cache (N variantes por combinação de filtros) — Felipe usa conjunto pequeno de combinações recorrentes; hit rate efetivo será alto.
- Q: TTL de fallback no cache? → A: **5 minutos (300s)** como guard-rail. Cache hit dentro da janela = 0 reads. Após 5min sem write OU sem outra ação que invalide via tag, próximo render re-executa a query. Limite superior de stale = 5min. Protege contra bug onde alguma Server Action esquece de invalidar.

## Summary

Hoje (2026-04-30) a cota de row reads do Turso (free tier) foi
estourada em produção. Auditoria identificou 3 causas
acumuladas:

1. **Regressão Inc 21** (entregue hoje): removi `LIMIT` do SQL
   de `queryCandidates` e `pickRandomUnratedRecord` pra fazer
   text filter accent-insensitive em JS. Resultado: cada visita
   ao `/sets/[id]/montar` lê ~10k tracks; cada clique no botão
   🎲 lê ~2500 records (vs 1 antes).
2. **Zero cache layer**: nenhuma query usa `unstable_cache` ou
   `cache()`. Cada render do RSC re-executa as queries inteiras.
   Home `/` sozinha lê ~12.5k rows por visita
   (2500 records + ~10k tracks aggregation + lookups).
3. **2 índices estratégicos faltam**: `records(user_id, archived,
   status)` e `tracks(record_id, is_bomb)`. Pré-existente; afeta
   speed mas não muda volume de reads sozinhos.

Esta feature entrega o **pacote consolidado** que resolve as
três causas em uma única release. Mudanças são puramente backend
— UI fica idêntica. O ganho é cota (custo) + responsividade
(percepção do DJ).

**Sem mudanças observáveis na UI**. Mesmas telas, mesmas listas,
mesmos filtros. Só carrega mais rápido e consome muito menos
quota Turso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — DJ usa o app sem estourar cota Turso (Priority: P1)

DJ usa o Sulco normalmente — abre `/`, navega entre discos,
monta sets, busca faixas, clica botão 🎲 várias vezes. Hoje cada
ação consumia milhares de row reads desnecessários. Após esta
feature, o consumo cai drasticamente; o app continua dentro da
cota gratuita do Turso e a fricção zero.

**Why this priority**: emergência operacional — sem isso, o app
fica indisponível ou exige upgrade pago. Caso fundador.

**Independent Test**: rodar bateria típica de uso (abrir home,
abrir 3 discos, abrir 1 set montar, clicar random 5 vezes) e
medir row reads via dashboard Turso. Esperado: redução >80%
vs comportamento pré-feature.

**Acceptance Scenarios**:

1. **Given** DJ acabou de carregar a home `/`, **When** o RSC
   completa o render, **Then** as queries de leitura "estável"
   (contadores, vocabulário de filtros, prateleiras, progresso
   de import) MUST ser servidas de cache se já foram executadas
   recentemente — zero row reads quando cache hit.
2. **Given** DJ visita `/sets/[id]/montar` pela primeira vez,
   **When** a listagem de candidatos carrega, **Then** o SQL
   executado MUST ler no máximo 1000 tracks (em vez de todas
   elegíveis), preservando todos os candidatos relevantes para
   filtros não-text e o text filter Inc 18.
3. **Given** DJ clica botão 🎲 sem termo de busca digitado,
   **When** `pickRandomUnratedRecord` é executado, **Then** o
   SQL MUST ler no máximo 1 row (caminho rápido `RANDOM() LIMIT 1`).
   Quando há termo de busca, comportamento JS post-filter Inc 18
   é preservado (correção desejada).

---

### User Story 2 — Manter integridade do Inc 21 (busca insensitive a acentos) (Priority: P1)

A busca textual em `/` e em `/sets/[id]/montar` continua
encontrando resultados independente de acentos (Inc 18 / 021).
Esta feature NÃO regrede o comportamento accent-insensitive —
apenas reduz o volume de rows examinadas em SQL.

**Why this priority**: regressão dupla seria pior que o problema
atual.

**Independent Test**: digitar `joao` em `/`, validar que `João
Gilberto` aparece. Digitar `aguas` em `/sets/[id]/montar`,
validar que `Águas de Março` aparece. Mesmo comportamento Inc 18.

**Acceptance Scenarios**:

1. **Given** DJ digita `joao` na busca da home, **When** lista
   atualiza, **Then** discos com `João` no artista/título/label
   aparecem. Bidirecional preservado (digitar `João` acha
   `joao` se houver).
2. **Given** DJ digita `aguas` em `/sets/[id]/montar`, **When**
   lista de candidatos atualiza, **Then** faixas com `Águas`
   aparecem como candidatas, dentro do limite SQL.

---

### User Story 3 — Cache invalida automaticamente após edições (Priority: P1)

DJ edita status de um disco via `<RecordStatusActions>` (Inc 19),
muda prateleira via `<ShelfPicker>` (Inc 21), ou edita curadoria
de uma faixa (Inc 13). O cache é invalidado automaticamente —
próxima visita à home/disco/montar mostra valores atualizados,
sem stale data.

**Why this priority**: cache silenciosamente desatualizado é
pior que cache ausente (debug horrível). Esta garantia mantém
contrato de consistência percebido.

**Independent Test**: aplicar mudança via Server Action existente
(ex: `updateRecordStatus`); recarregar a rota correspondente;
valor novo MUST aparecer imediatamente. Sem hard refresh.

**Acceptance Scenarios**:

1. **Given** DJ ativa um disco unrated via grid, **When** RSC
   re-renderiza após `revalidatePath('/')`, **Then** o card do
   disco mostra status `active` E o `collectionCounts` (footer)
   mostra contadores atualizados.
2. **Given** DJ adiciona prateleira nova via `<ShelfPicker>`,
   **When** abre outro disco, **Then** a nova prateleira aparece
   na lista de sugestões sem hard refresh.
3. **Given** DJ reconhece archived via Inc 11, **When** abre
   home ou status, **Then** banner global de archived some.

---

### Edge Cases

- **Cache hit em queries que envolvem múltiplos users**: cache
  precisa ser segmentado por `userId` (cada user vê o próprio
  cache). Tag por user (`['user', userId]` ou similar) garante
  isolation.
- **Sync diário invalida cache**: após sync, dados Discogs
  mudaram. `runDailyAutoSync` MUST disparar invalidação das
  queries afetadas (collectionCounts, listUserGenres,
  listUserStyles, getImportProgress).
- **Race condition: write + read sem revalidate**: se uma
  Server Action escreve mas esquece de chamar `revalidatePath`,
  cache pode ficar stale. Auditar todas as actions que mutam
  campos consultados pelas queries cacheadas, garantindo
  invalidação correta.
- **Limit 1000 em `queryCandidates`**: se DJ tem >1000 tracks
  elegíveis (active + selected) sem filtros não-text aplicados,
  pode haver candidatos válidos não retornados. Felipe hoje
  tem ~10k tracks total mas tipicamente <1000 elegíveis com
  filtros não-text aplicados (status='active' já reduz). Edge
  case raro; aceito como trade-off pro hotfix.
- **Botão 🎲 com text filter ativo**: caminho JS post-filter
  preserva — não regride Inc 18. Apenas o caminho sem text vira
  fast path SQL.
- **Multi-user (futuro)**: cada user tem seu cache isolado. DJ
  A não vê dados de DJ B mesmo via cache.
- **Mobile (Princípio V)**: ganho universal — todas as rotas
  mobile ficam mais rápidas (menos data transfer + menos espera).
  Sem mudança de UI mobile.
- **Index migration em prod**: aplicar via Turso shell sem
  downtime — `CREATE INDEX IF NOT EXISTS ...`. Operação online.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST reduzir o volume de row reads em
  rotas autenticadas (`/`, `/disco/[id]`, `/sets/[id]/montar`,
  `/status`) em pelo menos 80% comparado ao estado pré-feature
  na escala atual (~2500 records / ~10k tracks).
- **FR-002**: Sistema MUST limitar `queryCandidates` em até
  1000 tracks por execução SQL, mantendo o text filter
  accent-insensitive Inc 18 aplicado em JS após o limit.
- **FR-003**: Sistema MUST aplicar caminho rápido em
  `pickRandomUnratedRecord` quando o termo de busca está vazio
  (1 row read via `RANDOM() LIMIT 1`); manter caminho JS
  accent-insensitive quando há termo.
- **FR-004**: Sistema MUST manter o resultado funcional do
  Inc 18 (busca insensitive a acentos) intacto — paridade
  bidirecional, cobertura universal Unicode, multi-user
  isolation.
- **FR-005**: Sistema MUST cachear queries de leitura usadas
  nos renders RSC, com tag por user para segregação multi-user.
  Inclui contadores agregados, vocabulários de filtros, listas
  distintas, progresso de import, snapshot de status, **e
  também `queryCollection`** (Clarification Q1) com cache key
  composto absorvendo todos os filtros (status, text, genres,
  styles, bomba).
- **FR-006**: Cache MUST ser invalidado automaticamente quando
  Server Actions de write afetam dados das queries cacheadas
  (via `revalidatePath` ou `revalidateTag`).
- **FR-007**: Sistema MUST adicionar índice composite
  `records(user_id, archived, status)` cobrindo o filtro
  combinado mais comum em `queryCollection`.
- **FR-008**: Sistema MUST adicionar índice
  `tracks(record_id, is_bomb)` cobrindo o lookup de bombs no
  `queryCollection`.
- **FR-009**: A migração de índices MUST ser aplicada online
  em prod (sem downtime) via `CREATE INDEX IF NOT EXISTS`.
- **FR-010**: Sistema MUST manter integridade observável da UI:
  nenhum efeito visível ao DJ (mesmas telas, mesmos dados,
  mesma latência percebida ou melhor) — feature é puramente
  backend.

### Key Entities

Sem novas entidades. Reutiliza:
- **Record** (filtros existentes via `userId`/`archived`/`status`).
- **Track** (filtros existentes via `recordId`/`isBomb`).

Sem schema delta de colunas; apenas índices novos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após esta feature, uma sessão típica de uso
  (abrir home, abrir 3 discos, montar 1 set, clicar random 5
  vezes) consome ≤2k row reads — vs ~50k+ antes.
- **SC-002**: Home `/` em segunda visita (cache hit dentro da
  janela TTL de 5min) consome zero row reads adicionais até a
  próxima escrita do user OU expiração do TTL.
- **SC-003**: `/sets/[id]/montar` consome no máximo ~1000
  row reads em SQL por carregamento, vs ~10k antes.
- **SC-004**: Botão 🎲 sem termo de busca consome 1 row read,
  vs ~2500 após Inc 21.
- **SC-005**: Latência percebida em todas as rotas autenticadas
  permanece igual ou melhor (sem regressão de UX).
- **SC-006**: Inc 18 (busca insensitive a acentos) continua
  funcionando — cenários do quickstart 021 passam idênticos.
- **SC-007**: Multi-user isolation preservado — cache por user
  impede vazamento entre contas.
- **SC-008**: Sem downtime durante deploy nem aplicação dos
  índices.

## Assumptions

- Free tier Turso (~1B row reads/mês) é suficiente pra escala
  atual após esta otimização. Se Felipe escalar pra 5+ users
  ativos, abrir Inc paginação (Inc 22, já registrado) e/ou
  schema delta `searchBlob` (Inc futuro do 18 / 021).
- Limit `queryCandidates` em 1000 é seguro para escala atual:
  filtros não-text aplicados (status='active', archived=0,
  selected=true, eventuais gêneros/estilos/bomba) reduzem o
  conjunto elegível tipicamente para algumas centenas. Caso
  surja relato real de "candidato esperado não apareceu",
  revisitar limit.
- Cache TTL: configurado em **300s (5 minutos)** como
  guard-rail (Clarification Q2). Cada write invalida via tag
  imediatamente; sem write, cache expira em ≤5min. Protege
  contra bug de invalidação esquecida em alguma Server Action
  de write.
- Pattern de invalidação: Server Actions de write existentes
  já chamam `revalidatePath` nas rotas afetadas. Cache via
  `unstable_cache` com tags integra com o pipeline existente
  sem mudança nas actions de write — apenas leituras ganham o
  cache wrapper.
- Princípio I respeitado: leitura. Sem zona AUTHOR tocada.
- Princípio II respeitado: queries continuam RSC; cache é
  server-side (não client).
- Princípio III respeitado: schema delta de **2 índices**
  (não tabelas/colunas). Schema continua single source.
- Princípio IV respeitado: nada deletado nem perdido.
- Princípio V respeitado: ganho universal cross-device.
- Sem novas Server Actions. Refator localizado em queries
  + actions existentes.
