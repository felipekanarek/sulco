# Feature Specification: Cortes UX agressivos + dedup de queries

**Feature Branch**: `024-ux-cuts-dedup`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Inc 26 — Cortes UX agressivos + dedup de queries (post-diagnóstico Vercel logs). Reduzir queries DB por load `/` de 17 → 5 (-70%) eliminando duplicações entre RSCs paralelos e removendo componentes globais com baixo valor/custo. Hobby project zero gasto, escalar 5-10 amigos no free tier Turso."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ navega entre rotas autenticadas com baixo consumo (Priority: P1)

DJ abre `/`, navega pra `/sets`, volta pra `/`, abre `/disco/[id]`. Cada navegação deve consumir poucas leituras de banco (essencial pra manter app dentro do free tier Turso de 500M reads/mês com até 5-10 usuários).

**Why this priority**: este é o caminho crítico — sem isso, mesmo o uso solo do Felipe estoura cota. Bloqueia escala pra amigos.

**Independent Test**: instrumentação DB ativa em prod loga toda query. Carregar `/` 1× deve gerar ≤6 linhas `[DB]` no log Vercel; antes geram 17.

**Acceptance Scenarios**:

1. **Given** DJ autenticado com import já reconhecido, **When** carrega `/` (hard refresh), **Then** o sistema executa no máximo 6 queries SQL distintas (típico: 1× users, 1× user_facets, 1× records LIMIT 50, 1× tracks aggregations, 1× tracks bombs, +1 opcional `getImportProgressLight` quando aplicável) — sem duplicações entre componentes.
2. **Given** DJ navega de `/` para `/sets`, **When** chega em `/sets`, **Then** o header não dispara queries adicionais de "alertas" ou "archived" (componentes globais removidos).
3. **Given** DJ tem import inicial concluído e reconhecido, **When** carrega `/`, **Then** nenhuma query de progresso de import é executada (componente condicional não renderiza).
4. **Given** instrumentação DB ativa, **When** carrega `/`, **Then** logs mostram zero ocorrências do mesmo SELECT users repetido em paralelo (dedup via cache de request).

---

### User Story 2 - DJ continua acessando alertas de sync e archived via /status (Priority: P2)

Após corte do `<SyncBadge>` global e do `<ArchivedRecordsBanner>` global, DJ ainda precisa conseguir descobrir e revisar discos arquivados ou erros de sync. Caminho de descoberta passa pelo menu "Sync" → `/status`.

**Why this priority**: garante que o corte de UX não faz DJ perder acesso a informação importante — só muda o canal (push → pull).

**Independent Test**: DJ entra em `/status` e vê listagem completa de archived pendentes + erros de sync recentes. Mesma informação que estava no banner/badge antes.

**Acceptance Scenarios**:

1. **Given** existe ≥1 disco archived sem ack, **When** DJ entra em `/status`, **Then** vê lista de archived pendentes (mesma que estava no banner global).
2. **Given** existe ≥1 sync com outcome diferente de "ok", **When** DJ entra em `/status`, **Then** vê esse alerta na lista de runs (mesma info que ativava o badge).
3. **Given** DJ está em qualquer rota autenticada, **When** abre o menu (desktop ou mobile), **Then** "Sync" continua acessível e leva para `/status`.

---

### User Story 3 - DJ não acessa mais a rota /curadoria (Priority: P3)

Rota `/curadoria` está obsoleta — DJ usa fluxo direto via `/disco/[id]`. Remoção elimina mais um RSC carregando registros completos. Acesso a `/curadoria` por bookmark antigo deve responder 404 (não crash).

**Why this priority**: é cleanup, não funcionalidade nova. Mas reduz superfície de queries pesadas (helper `listCuradoriaIds` faz scan de records).

**Independent Test**: GET `/curadoria` retorna 404; menu não mostra mais o link; nenhum link interno aponta pra essa rota.

**Acceptance Scenarios**:

1. **Given** rota `/curadoria` removida, **When** usuário tenta acessar diretamente, **Then** Next.js retorna 404.
2. **Given** menu desktop e mobile renderizados, **When** DJ procura "Curadoria", **Then** não encontra (item removido).
3. **Given** code base após remoção, **When** rodar `grep -rn "/curadoria"` em src/, **Then** zero resultados em código de produção (apenas em comentários históricos ou docs).

---

### Edge Cases

- **DJ sem import concluído** (outcome='running' ou ack ausente): `<ImportProgressCard>` continua renderizando normalmente; queries condicionais rodam apenas neste caso.
- **DJ recém-cadastrado** (sem records): home funciona com counts em zero vindos de `user_facets`; nenhuma query extra dispara.
- **Múltiplas abas abertas**: cada aba executa suas próprias queries (sem cache cross-aba); decisão é aceitar este custo como inerente a uso multi-aba — DJ raramente abre múltiplas.
- **Cron de sync diário falha**: detecção de zombie atrasa até 24h (próximo cron). Aceitável — zombie é raro, log de erro fica registrado.
- **Bookmark/link externo apontando para `/curadoria`**: 404 padrão do Next; não exigimos redirect explícito (rota morta, sem URLs públicas conhecidas).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST resolver o usuário autenticado uma única vez por request RSC, mesmo quando múltiplos componentes RSC paralelos chamam a função de resolução.
- **FR-002**: O sistema MUST resolver os facets do usuário (genres, styles, moods, contexts, shelves, counts) uma única vez por request RSC, mesmo quando múltiplos consumidores derivam dados dos facets.
- **FR-003**: O componente que sinaliza alertas de sincronização (SyncBadge) MUST ser removido do layout global. Acesso à informação fica via menu → `/status`.
- **FR-004**: O componente que sinaliza discos arquivados pendentes (ArchivedRecordsBanner) MUST ser removido do layout global. Acesso à informação fica via `/status`.
- **FR-005**: O componente de progresso de import (ImportProgressCard) MUST renderizar apenas quando há import em andamento OU quando o usuário ainda não reconheceu o import concluído. Caso contrário, não renderiza nem dispara queries adicionais.
- **FR-006**: A detecção e limpeza de syncs zumbis (killZombieSyncRuns) MUST ocorrer apenas no cron diário (`/api/cron/sync-daily`), não a cada request de leitura.
- **FR-007**: A rota `/curadoria` (e sub-rotas como `/curadoria/concluido`) MUST ser removida do código de produção. Tentativas de acesso direto retornam 404 padrão do Next.js.
- **FR-008**: Itens de menu apontando para `/curadoria` (desktop e mobile) MUST ser removidos.
- **FR-009**: Helpers de query exclusivamente usados por `/curadoria` (sem outros callers) MUST ser removidos do código.
- **FR-010**: Todos os links de navegação entre rotas autenticadas (`<Link>`) MUST ter `prefetch={false}` para evitar prefetch automático que dispara queries em background.
- **FR-011**: Após todas as remoções, o sistema MUST continuar funcional para os fluxos principais: visualizar coleção em `/`, curar disco em `/disco/[id]`, montar set em `/sets/[id]/montar`, ver alertas em `/status`, configurar conta em `/conta`.
- **FR-012**: A informação de archived pendentes e alertas de sync MUST permanecer acessível em `/status` (não pode ser deletada do código — apenas o ponto de exibição global é removido).
- **FR-013**: Decisões de remover/condicionar componentes globais MUST preservar tap targets ≥44×44 px no menu mobile (Princípio V) para o caminho alternativo de descoberta (`/status`).

### Key Entities

Não há mudanças em entidades de dados. Esta feature é puramente de UI/render — schema e tabelas permanecem inalterados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O número de queries SQL distintas executadas por load de `/` (DJ autenticado, import já reconhecido) cai de 17 para no máximo 6, medido via instrumentação DB nos logs Vercel.
- **SC-002**: O número de queries SQL distintas executadas em qualquer rota autenticada não-`/` (ex: `/sets`, `/conta`) cai em pelo menos 5 unidades (correspondendo aos componentes globais removidos).
- **SC-003**: O tempo de cold start do Lambda Vercel para `/` cai em pelo menos 50% (de ~1.2s para ~600ms ou menos), medido via Vercel Functions log "Duration".
- **SC-004**: Em uso solo intenso (50 loads/dia + 20 mutations/dia), o consumo total de row reads na Turso fica abaixo de 1M/dia (vs ~3M/dia hoje).
- **SC-005**: Projeção para 5 usuários (mesmo padrão de uso) mantém consumo abaixo de 5M/dia, dentro de 30% do free tier mensal de 500M.
- **SC-006**: Zero links de navegação autenticada disparam prefetch automático (verificado via `grep` em `<Link>` sem `prefetch={false}`).
- **SC-007**: Fluxos de leitura principais (`/`, `/disco/[id]`, `/sets/[id]/montar`, `/status`, `/conta`) continuam funcionais sem regressão visível ao DJ.
- **SC-008**: Nenhuma rota autenticada apresenta erro 500 ou JS broken após remoções (validado em smoke test pós-deploy).

## Assumptions

- DJ usa app autenticado via Clerk; rotas autenticadas executam middleware Clerk; layout global só renderiza componentes globais para usuários signed-in (já é o caso hoje).
- Felipe é único usuário em prod; outras 1-2 contas de teste têm coleção vazia; medições serão sobre a conta principal (~2588 records, ~10k tracks).
- Cron diário `/api/cron/sync-daily` está funcionando e roda 1×/dia (já existe na configuração `vercel.json`).
- React 19 está disponível (Next.js 15 traz por padrão); a feature `cache()` do React 19 dedupa por request RSC.
- Instrumentação DB (`[DB]` logs em `src/db/index.ts`) permanece ativa durante validação e é revertida após sucesso confirmado.
- Não há dependência externa de `/curadoria` — DJ explicitamente declarou que a rota está morta.
- Componente `<ImportProgressCard>` continua existindo no código; apenas o ponto de inclusão muda para condicional baseada em estado retornado por `getImportProgress`.
- Computação de "badge ativo" (lógica de detectar alertas) pode ser deletada junto com o badge — sem outros consumidores conhecidos.
- Trade-off de zombie sync detection: aceitar latência de até 24h em vez de detecção em tempo real (zombie é evento raro; cron já lida).
- Esta feature é puramente reversível por commit revert — sem migration, sem schema delta, sem perda de dados.
