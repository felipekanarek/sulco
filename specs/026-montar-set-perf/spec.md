# Feature Specification: Otimização do fluxo de montar set

**Feature Branch**: `026-montar-set-perf`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Inc 28 — Otimização do fluxo de montar set + sets list. Diagnóstico em prod (sessão 2026-05-02 pós Inc 27) revelou que `/sets/[id]/montar` é hoje o gargalo dominante: cada render dispara ~7 queries (incluindo 2 SELECTs JOIN tracks com scan completo de ~10k tracks via `listSelectedVocab`); cada toggle de filtro = ~9 queries (POST UPDATE sets + GET re-render); adicionar 1 candidato custa ~13 queries por causa de Server Action com 5 SELECTs preparatórios + re-render. Curadoria típica de 1 set (30 toggles + 20 adds + 5 removes) = ~600 queries / ~1M rows lidas. Atacar com 4 frentes: (C) listSelectedVocab deriva de user_facets cached (Inc 24); (A) debounce filter persist; (B) aiProvider/aiModel via CurrentUser cached (Inc 27 leftover); (D) combinar SELECTs preparatórios em addTrackToSet."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ monta set ajustando filtros sem queimar reads (Priority: P1)

DJ entra em `/sets/[id]/montar`, ajusta múltiplos chips de filtro (gêneros, estilos, moods, contexts, BPM, key) em sequência rápida pra refinar candidatos. Cada toggle deve consumir mínimo de leituras de banco — não disparar recompute de catálogo nem persist redundante.

**Why this priority**: caminho mais quente do produto durante curadoria de set. Hoje é o que mais consome reads do app inteiro.

**Independent Test**: instrumentação `[DB]` ativa em prod. Carregar `/sets/[id]/montar` deve gerar ≤ 5 linhas `[DB]` (vs ~7 hoje); toggle de 5 filtros em <2s deve gerar ≤ 2 POSTs `update sets` (vs ~10 hoje sem debounce).

**Acceptance Scenarios**:

1. **Given** DJ autenticado em `/sets/[id]/montar` com import já reconhecido, **When** carrega a página (hard refresh), **Then** o sistema executa no máximo 5 queries SQL distintas (sem queries que escaneiam toda a tabela de tracks).
2. **Given** DJ ativa 5 chips de filtro em sequência rápida (intervalo entre cliques < 500ms), **When** os 5 cliques terminam, **Then** o sistema dispara no máximo 2 persistências de filtro (debounce ativo).
3. **Given** DJ aguarda ≥ 500ms após o último toggle, **When** o estado se estabiliza, **Then** uma única persistência é disparada (não múltiplas).
4. **Given** instrumentação ativa, **When** DJ carrega o montar, **Then** logs mostram ZERO ocorrências de query SQL que faça SCAN da tabela `tracks` inteira (queries de vocabulário derivam de cache materializado).
5. **Given** DJ alterna seleção de filtro com debounce ativo, **When** observa o resultado de candidatos, **Then** a UI atualiza imediatamente (estado client) e a persistência ocorre em background — nenhuma latência percebida.

---

### User Story 2 - DJ adiciona candidatos com custo mínimo de queries (Priority: P2)

DJ vê lista de candidatos no painel direito do montar, clica "+ Adicionar" em cada um pra adicionar ao set. Cada add deve consumir queries mínimas e não disparar recompute pesado.

**Why this priority**: segundo caminho mais quente. DJ adiciona 20+ candidatos por set em sessão típica.

**Independent Test**: instrumentação ativa. Adicionar 1 candidato deve gerar ≤ 4 queries (vs ~13 hoje), sem queries de scan.

**Acceptance Scenarios**:

1. **Given** DJ em `/sets/[id]/montar`, **When** clica "+ Adicionar" em um candidato, **Then** o sistema executa no máximo 4 queries de Server Action: 1 para resolução do usuário, 1 para verificação combinada de ownership e estado do set (1 query única que retorna posição do próximo item), e 1 para inserção. Total: 3-4 queries.
2. **Given** DJ tenta adicionar uma faixa que já está no set, **When** a Server Action conclui, **Then** o sistema retorna mensagem clara ("já está no set") sem inserção duplicada — sem perder essa info pra UI.
3. **Given** DJ adiciona 20 candidatos sequencialmente, **When** mede o total de rows lidas, **Then** o agregado fica abaixo de 200 rows (vs ~5k hoje).

---

### User Story 3 - DJ vê página do montar sem queries duplicadas de configuração (Priority: P3)

A página do montar carrega configuração de IA (provider + model) pra decidir se botão "✨ Sugerir com IA" fica habilitado. Esse dado deve vir do mesmo objeto de usuário cached por request — não consulta separada.

**Why this priority**: Inc 27 leftover. Ganho pequeno mas trivial de implementar (mesma técnica do Inc 27 em /disco/[id]).

**Independent Test**: instrumentação ativa. Carregar montar deve gerar ZERO queries `select ai_provider, ai_model from users` separadas.

**Acceptance Scenarios**:

1. **Given** DJ carrega `/sets/[id]/montar`, **When** a página termina de renderizar, **Then** a configuração de IA (provider + model) é resolvida sem consulta extra ao banco — vem do mesmo objeto de usuário cached.
2. **Given** Server Action `suggestSetTracks` precisa da chave criptografada de IA, **When** a action executa, **Then** o sistema lê a chave via consulta dedicada (chave NÃO incluída no objeto cached genérico, princípio de menor exposição).

---

### Edge Cases

- **DJ alterna o mesmo filtro 3× rapidamente** (on→off→on): debounce coalesce em 1 persist final; valor persistido reflete o estado final, não o inicial.
- **DJ navega para outra rota antes do debounce expirar**: persist deve disparar imediatamente no unmount/blur (flush) pra não perder estado.
- **DJ multi-aba (mesmo set aberto em 2 abas)**: cada aba persiste independente; última escrita vence (eventual consistency aceita — feature é preferência, não dado crítico).
- **DJ sem coleção (zero tracks)**: vocabulário materializado retorna lista vazia; UI mostra estado "nenhum mood/context disponível".
- **Set vazio (zero tracks adicionadas)**: render normal; bag física no painel direito do `/sets/[id]` mostra "—".
- **Debounce em conexão lenta (mobile 3G)**: 500ms de espera vira invisível porque DJ raramente toca chips em <500ms; persist demorando 1-2s não bloqueia UI.
- **Add candidato com track que foi deletada entre render e click**: ownership check ainda detecta; retorna erro claro ao DJ.
- **Recompute completo (sync diário)**: continua atualizando `moodsJson`/`contextsJson` em facets; vocabulário no montar reflete em ≤ 24h.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST resolver listas de vocabulário (moods, contexts) usadas como sugestões de filtro em `/sets/[id]/montar` a partir de cache materializado já disponível, sem escanear tabelas de faixas a cada render.

- **FR-002**: O sistema MUST persistir preferências de filtro do DJ no servidor (para sincronia multi-device), mas com debounce de no mínimo 500ms entre eventos de toggle — múltiplos toggles consecutivos devem coalescer em uma única persistência.

- **FR-003**: A persistência de filtros MUST refletir o estado final de uma sequência rápida de toggles (não estado intermediário).

- **FR-004**: Em caso de DJ navegar para fora da página (rota muda) antes do debounce expirar, o sistema MUST disparar a persistência pendente imediatamente (flush on unmount).

- **FR-005**: A configuração de IA do usuário (provider + modelo, sem chave) MUST ficar disponível no objeto de usuário cached por request — nenhuma consulta extra para essa informação ao renderizar páginas que decidem habilitação de botões IA.

- **FR-006**: A chave criptografada de IA MUST permanecer fora do objeto cached genérico — apenas funções que de fato chamam o provider IA leem a chave via consulta dedicada (princípio de menor exposição).

- **FR-007**: A operação de adicionar uma faixa a um set MUST executar no máximo 4 queries SQL distintas (resolução de usuário + 1 query combinando verificações de ownership e estado do set + inserção), sem múltiplas queries preparatórias separadas.

- **FR-008**: Ao tentar adicionar uma faixa que já está no set, o sistema MUST retornar uma mensagem clara informando o estado ("já está no set") sem causar inserção duplicada e sem perder essa informação para a UI.

- **FR-009**: A UI de filtros MUST atualizar candidatos imediatamente baseado no estado client (sem aguardar persistência server) — debounce ocorre apenas no salvamento.

- **FR-010**: Após esta otimização, a curadoria típica de um set (30 toggles + 20 adds + 5 removes) MUST consumir no máximo 100 queries SQL distintas no agregado (vs ~600 hoje).

- **FR-011**: O sistema MUST manter visíveis ao DJ todas as informações que vinham na página antes da otimização: lista de candidatos com filtros aplicados, vocabulário de moods/contexts, contagem do set, estado de configuração de IA, briefing.

- **FR-012**: Se o cache materializado de vocabulário estiver desatualizado por drift (raro, corrigido pelo cron diário), a UI deve continuar funcional com a versão materializada — drift de até 24h é aceito.

### Key Entities

Não há entidades novas. Esta feature é puramente de otimização de leituras + UX de filtros — schema permanece intocado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O número de queries SQL distintas executadas em um carregamento de `/sets/[id]/montar` (DJ autenticado, set existente) cai de ~7 para no máximo 5, medido via instrumentação nos logs do hospedador.

- **SC-002**: O número total de rows lidas durante o carregamento da página `/sets/[id]/montar` cai de ~20.000 para no máximo 100 (eliminação do scan de catálogo de faixas para vocabulário).

- **SC-003**: Em uma sequência rápida de 5 toggles de filtro (intervalo < 500ms entre cliques), o número de persistências disparadas cai de ~10 (com duplo-fire) para no máximo 2.

- **SC-004**: A operação de adicionar 1 candidato a um set executa no máximo 4 queries SQL (vs ~5-6 hoje na Server Action, ignorando re-render).

- **SC-005**: O número total de rows lidas durante uma curadoria típica de 1 set (30 toggles + 20 adds + 5 removes) cai de ~1.000.000 para no máximo 5.000 — redução ≥ 99%.

- **SC-006**: Em uso solo intenso (1 set montado por dia), o consumo total de row reads na base de dados fica abaixo de 30.000/dia (vs ~1.000.000+/dia hoje em sessão de set).

- **SC-007**: Projeção para 5 usuários (mesmo padrão de uso) mantém consumo abaixo de 150.000 reads/dia, ≤ 0,03% do free tier mensal de 500M reads.

- **SC-008**: Não há regressão de comportamento observável para o DJ — vocabulário continua refletindo o catálogo, filtros continuam persistidos e sincronizados entre devices, candidatos continuam corretos.

- **SC-009**: A UI de filtros continua respondendo imediatamente (≤ 100ms) ao toggle — debounce não introduz latência percebida porque atualização de candidatos é client-side.

## Assumptions

- Vercel Hobby permanece o ambiente de execução; cota Turso free tier (500M reads/mês) é o teto a respeitar.
- DJ é único usuário ativo em prod no curto prazo; projeção para 5-10 amigos é o alvo.
- Cache materializado de vocabulário (`user_facets.moodsJson`/`contextsJson`) já existe (Inc 24) e é mantido atualizado por delta updates (Inc 27) + cron diário de drift correction.
- Inc 27 já incluiu `aiProvider`/`aiModel` no objeto `CurrentUser` cached — esta feature apenas migra o caller `/sets/[id]/montar` que ficou pendente.
- DJ raramente clica chips de filtro em intervalos < 50ms (uso humano); debounce de 500ms é compatível com padrão de uso.
- Multi-aba em mesmo set é caso edge raro; eventual consistency com "última escrita vence" é aceito.
- Drift residual de até 24h em vocabulário materializado é aceito (cron corrige) — DJ adicionar mood novo numa faixa não precisa aparecer instantaneamente no chip picker do montar.
- A feature é puramente reversível por revert de commits — sem migration, sem schema delta, sem perda de dados.
- Helper `getUserFacets` (Inc 24, cached via Inc 26) já é a fonte de verdade para vocabulário materializado e shelves; padrão estabelecido.
- Server Actions de write em set (`addTrackToSet`, `removeTrackFromSet`, `reorderSetTracks`) podem manter `revalidatePath('/sets/[id]/montar')` que dispara re-render — gain principal vem das queries internas serem mais baratas, não da eliminação do re-render.
