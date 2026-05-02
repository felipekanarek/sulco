# Feature Specification: Recompute incremental + dedups remanescentes em /disco/[id]

**Feature Branch**: `025-incremental-recompute`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Inc 27 — Recompute incremental + dedups remanescentes. Diagnóstico em prod (sessão 2026-05-02 pós-Inc 26) mostrou que cada edição em /disco/[id] dispara recomputeFacets síncrono (~7 queries pesadas, ~50-100k rows/edição). Curadoria típica de 1 disco = 30-50 edições = ~2M+ rows lidas, batendo cota Turso. Substituir por delta updates direcionados em user_facets quando algo realmente muda; skip total quando edição não afeta facets. Drift residual corrigido por cron noturno."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ cura disco gastando ~zero reads de catálogo (Priority: P1)

DJ abre `/disco/[id]` e faz 30+ edições típicas (toggle selected em 5 faixas, ajustar BPM em 8, marcar 2 como bomba, escrever comentário em 4, mudar status do disco, ajustar prateleira, escrever notes). Cada edição deve consumir um custo mínimo de leituras Turso — proporcional ao que **de fato** mudou nas agregações materializadas, não um recompute completo do catálogo.

**Why this priority**: caminho crítico do produto (curadoria é o valor central) e onde mais reads vazam hoje (~2M por curadoria). Sem isso, mesmo o uso solo do Felipe estoura cota; impossível escalar para amigos.

**Independent Test**: instrumentação `[DB]` ativa em prod. Editar 1 faixa (toggle selected) deve gerar ≤ 5 linhas `[DB]` em vez de ~16 atuais; rows lidas ≤ 20 em vez de ~50-100k.

**Acceptance Scenarios**:

1. **Given** DJ edita campo de uma faixa que **não** afeta agregações materializadas (BPM, key, energy, comment, rating, fineGenre, references, isBomb, aiAnalysis), **When** a Server Action conclui, **Then** o sistema **não dispara nenhum recompute** das agregações de catálogo (zero queries de scan).

2. **Given** DJ alterna status de um disco (ex: unrated→active), **When** a Server Action conclui, **Then** o sistema atualiza apenas os contadores afetados em `user_facets` via 1 instrução de update curta (custo ≤ 5 rows lidas), sem reler a coleção inteira.

3. **Given** DJ alterna seleção de uma faixa (selected toggle), **When** a Server Action conclui, **Then** o sistema atualiza apenas o contador `tracksSelectedTotal` em `user_facets` via 1 update.

4. **Given** DJ adiciona ou remove um mood ou context em uma faixa, **When** a Server Action conclui, **Then** o sistema recomputa apenas o vocabulário do tipo afetado (moods OU contexts) — não ambos, não os outros facets.

5. **Given** DJ muda a prateleira (`shelfLocation`) de um disco, **When** a Server Action conclui, **Then** o sistema recomputa apenas a lista de prateleiras (`shelves_json` em user_facets); demais agregações intocadas.

6. **Given** DJ edita apenas o campo `notes` (texto livre) de um disco, **When** a Server Action conclui, **Then** o sistema **não dispara recompute** algum (notes não está em facets).

7. **Given** DJ executa 30 edições em sequência durante curadoria, **When** mede o total de rows lidas, **Then** o agregado fica abaixo de 1.000 rows (vs ~2M hoje).

---

### User Story 2 - Página de disco carrega com queries deduplicadas (Priority: P2)

DJ abre `/disco/[id]`. O RSC carrega o disco, suas faixas, e a configuração de IA do usuário. Cada um desses dados deve ser lido **uma única vez** por render, não múltiplas vezes via componentes paralelos consultando o mesmo recurso.

**Why this priority**: complementa US1 atacando o lado de leitura. Sem isso, o ganho de US1 é parcialmente neutralizado pelas re-renderizações pós-`revalidate`.

**Independent Test**: instrumentação `[DB]` ativa. Carregar `/disco/[id]` (hard refresh) deve gerar ≤ 5 linhas `[DB]` distintas. Após uma edição com `revalidatePath`, o re-render deve fazer no máximo 1 nova consulta por recurso (sem duplicações dentro do mesmo render).

**Acceptance Scenarios**:

1. **Given** DJ carrega `/disco/[id]`, **When** a página termina de renderizar, **Then** a configuração de IA do usuário (provider + model usados pra decidir habilitar/desabilitar botões IA) é resolvida **sem consulta extra ao banco** — vem do mesmo objeto de usuário cached por request.

2. **Given** Server Action `analyzeTrackWithAI` precisa da chave de IA criptografada para chamar o provider externo, **When** a action executa, **Then** o sistema lê a chave criptografada via consulta dedicada (a chave **não** é incluída no objeto cached genérico do usuário — manter princípio de menor exposição).

3. **Given** DJ realiza uma edição em uma faixa, **When** a página re-renderiza após `revalidatePath`, **Then** a página não consulta o catálogo ou agregações irrelevantes ao disco — apenas o disco em si e dados estritamente necessários ao render.

---

### User Story 3 - Drift residual entre delta updates e estado real é corrigido automaticamente (Priority: P2)

Em raros cenários (bug, race, edição via SQL direto, sync incremental que altera múltiplos records), os contadores e listas em `user_facets` podem desviar do estado real. O sistema deve corrigir esse drift de forma silenciosa e diária, sem depender de intervenção do usuário.

**Why this priority**: garante correção a longo prazo do trade-off de delta updates. Sem isso, drift acumula e usuário acaba vendo contagens erradas em filtros e na home.

**Independent Test**: cron noturno executa após 2026-05-03 (ou disparado manualmente). Logs do cron mostram que `recomputeFacets` completo foi rodado para cada usuário; após execução, valores em `user_facets` batem exatamente com agregações computadas do zero.

**Acceptance Scenarios**:

1. **Given** o cron diário de manutenção executa, **When** termina, **Then** todos os usuários ativos tiveram seus `user_facets` recomputados a partir das fontes (records + tracks); divergências silenciosas entre delta e estado real foram corrigidas.

2. **Given** ocorreu drift sintético (forçado em teste — ex: alterar manualmente `records_active` em `user_facets`), **When** o cron executa, **Then** o valor é restaurado ao real na próxima execução.

3. **Given** `runIncrementalSync` ou `runInitialImport` adiciona/arquiva múltiplos records em batch, **When** o sync conclui, **Then** o sistema chama `recomputeFacets` completo (não delta) para refletir a mudança em massa de uma vez.

---

### Edge Cases

- **Race condition em delta**: dois cliques simultâneos em "ativar" disco diferente disparam dois updates concorrentes em `user_facets.records_active`. SQLite serializa transações por padrão; resultado final correto desde que cada delta seja idempotente em relação à transição válida (status anterior ↔ novo). Não usar incrementos cegos sem checar o estado anterior.

- **Delta com estado já mudado**: usuário clica "ativar" duas vezes em sequência (segunda vez já está ativo — Server Action retorna no-op pré-update). Delta só dispara quando o UPDATE em records realmente muda alguma linha (`returning {id}` retorna ≥ 1). Se UPDATE não afetou linhas (status já estava como solicitado), pular delta.

- **Vocabulário com termo último**: DJ remove o último mood "atmosférico" de qualquer faixa. Recompute parcial de moods deve refletir isso — `moods_json` perde o termo. Implementação: SELECT distinct values JOIN tracks WHERE archived=0; se `aggregateVocabulary` retorna vazio para um termo que estava antes, ele desaparece do JSON.

- **Shelf que ficou sem records**: DJ muda `shelfLocation` de um disco e era o último disco naquela prateleira. `shelves_json` perde a entrada. Mesmo padrão do mood acima.

- **Drift detectado pelo cron**: cron detecta divergência ≥ 1 unidade. Apenas corrige silenciosamente (UPSERT) e loga `[recompute-cron] user N drift detected: X→Y`. Nenhum alerta ao usuário.

- **Cron falha**: drift não corrigido nesse dia. Próximo cron resolve. Risco baixo (drift não é fatal — afeta apenas exibição em filtros, contadores; valores reais nas tabelas-fonte permanecem corretos).

- **Edição mistura campos com e sem impacto em facets**: ex: DJ envia uma única operação que muda BPM (sem impacto) + selected (com impacto). Sistema dispara delta apenas para selected. BPM é apenas update direto na tabela tracks.

- **`updateRecordAuthorFields` com payload vazio efetivo** (campos no payload mas valores idênticos aos atuais): UPDATE não afeta linhas → pular delta de shelves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST atualizar agregações materializadas de catálogo via operações direcionadas que reflitam apenas o que mudou no write (deltas), não recomputando todas as agregações a cada edição.

- **FR-002**: Edições em campos de faixa que não afetam agregações materializadas (BPM, key musical, energia, comentário, rating, gênero fino, referências, marcação de bomba, análise de IA) MUST NÃO disparar recompute algum.

- **FR-003**: Mudança de status de disco (`unrated`/`active`/`discarded`) MUST disparar update direcionado nos contadores correspondentes em `user_facets`, sem reler o catálogo.

- **FR-004**: Toggle de seleção de faixa (`selected`) MUST disparar update direcionado em `tracksSelectedTotal`, sem reler tracks da coleção.

- **FR-005**: Mudança em vocabulário de faixa (moods OU contexts) MUST disparar recompute parcial APENAS do vocabulário do tipo afetado, sem tocar facets de gêneros/estilos/contadores.

- **FR-006**: Mudança em prateleira (`shelfLocation`) MUST disparar recompute parcial APENAS da lista de prateleiras, sem tocar outros facets.

- **FR-007**: Edições que **não** alteram nenhuma linha (UPDATE retornando 0 rows afetadas) MUST NÃO disparar nenhum delta.

- **FR-008**: Sync incremental e import inicial (operações em massa) MUST continuar usando recompute completo no fim, dado que afetam múltiplos records simultaneamente.

- **FR-009**: O sistema MUST executar um job de manutenção diário que recompute as agregações completas para cada usuário ativo, corrigindo silenciosamente qualquer drift acumulado entre deltas.

- **FR-010**: O job de manutenção diário MUST registrar em log a contagem de drift detectado por usuário (para observabilidade), mas NÃO MUST notificar o usuário.

- **FR-011**: A configuração de IA do usuário (provider + model) MUST ficar disponível no objeto de usuário cached por request, eliminando consulta extra em renders de páginas que usam essa info para decidir UI condicional (ex: habilitar/desabilitar botão "Analisar com IA").

- **FR-012**: A chave de IA criptografada (segredo) MUST NÃO ser incluída no objeto de usuário cached genérico — apenas a parte público-relevante (provider + model). Funções que precisam de fato chamar o provider externo continuam fazendo consulta dedicada à chave.

- **FR-013**: Server Actions MUST NÃO chamar `revalidatePath` apontando para rotas inexistentes no produto (ex: caminhos para rotas removidas em releases anteriores).

- **FR-014**: O sistema MUST manter a função de recompute completo disponível como fallback (chamada explícita pelo caller quando o caso justifica — sync em massa, cron, comando administrativo).

- **FR-015**: O sistema MUST garantir que os princípios da Constituição (Soberania de dados do DJ, Server-First, Schema é a fonte da verdade, Preservação, Mobile-Native) sejam preservados após esta mudança.

### Key Entities

Não há entidades novas. Mudanças confinadas à camada de **escrita em `user_facets`** (tabela existente do Inc 24) e ao tipo de objeto de usuário em memória (estende campos já presentes na tabela `users`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O número de queries SQL distintas executadas em uma Server Action típica de edição de faixa (toggle selected, ou ajuste de BPM/comment) cai de ~16 para ≤ 5, medido via instrumentação `[DB]` em prod.

- **SC-002**: O número total de rows lidas durante uma curadoria típica de 1 disco com 30 edições mistas (status, shelf, notes, BPM, key, energy, moods, contexts, comment, rating, selected, isBomb) cai de ~2.000.000 para ≤ 1.000.

- **SC-003**: Edições em campos sem impacto em facets (BPM, comment, rating, etc.) executam em ≤ 200ms (Server Action), sem latência adicional do recompute.

- **SC-004**: Em uso solo do mantenedor (1-3 curadorias/dia), o consumo total de row reads na Turso fica abaixo de 50.000/dia (vs ~2-6M/dia hoje).

- **SC-005**: Projeção para 5 usuários (mesmo padrão de uso) mantém consumo abaixo de 250.000 reads/dia, ≤ 0.05% do free tier mensal de 500M.

- **SC-006**: O job de manutenção diário corrige qualquer drift dentro de 24h sem requerer intervenção manual.

- **SC-007**: Não há regressão de comportamento observável para o DJ — contadores em `/`, `/sets/[id]/montar`, e `/status` continuam refletindo o estado real do catálogo após operações típicas.

- **SC-008**: Página `/disco/[id]` continua respondendo em ≤ 800ms cold start (mesma SLA pós-Inc 26).

## Assumptions

- Vercel Hobby permanece o ambiente de execução; cota Turso free tier (500M reads/mês) é o teto a respeitar.
- Mantenedor é único usuário ativo em prod no curto prazo; Felipe projeta escalar para 5-10 amigos no médio prazo.
- O cron diário existente em `/api/cron/sync-daily/route.ts` (que já itera todos os usuários) é o lugar natural para adicionar o recompute completo de manutenção. Não exige cron novo separado.
- Drift residual entre delta updates e estado real é tolerável até o próximo ciclo de cron (≤ 24h). Felipe aceita esse trade-off em troca da redução massiva de leituras.
- SQLite/Turso serializa transações (default journal_mode=WAL); deltas concorrentes em diferentes contadores não causam corrupção, e dois deltas no mesmo contador são serializados.
- A constituição existente cobre os princípios I (Soberania), II (Server-First), III (Schema verdade), IV (Preservar), V (Mobile-Native). Esta feature respeita todos.
- Instrumentação `[DB]` permanece ativa durante validação e é desligada via env var (`DB_DEBUG=0`) após sucesso confirmado, sem revert de código.
- Nenhuma migration de schema é necessária. Todos os campos requeridos já existem em `user_facets` (Inc 24) e `users` (Inc 12 + Inc 26).
- A página de admin (`/admin`, `/admin/convites`) e fluxos de credencial Discogs raramente disparam writes — não otimizar especificamente.
- Reversibilidade: toda a feature é reversível por revert dos commits; não destrói dados (drift é corrigido pelo cron na primeira execução pós-revert).
