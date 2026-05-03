# Feature Specification: Search text materializado em records

**Feature Branch**: `027-search-text-materialized`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Inc 32 — Search text materializado em records (paginação SQL com busca insensitive a acentos). Diagnóstico em prod (sessão 2026-05-02 pós Inc 28) mostrou que o home `/` carrega ~2588 rows (coleção inteira) quando há text filter ativo na URL. Inc 18 (busca insensitive a acentos) deliberadamente desabilitou paginação SQL com text filter porque SQLite/Turso não tem `unaccent` nativo — filtro roda em JS pós-query, exigindo carregar tudo. Solução: coluna pre-normalizada em records + index + LIKE SQL."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ busca por texto sem queimar reads (Priority: P1)

DJ entra em `/` (coleção) e digita uma busca textual (ex: "joão", "açúcar", "sergio"). A busca deve ser insensitive a acentos (digitar "joao" encontra "João") **e** consumir poucas leituras de banco mesmo em coleções grandes — proporcional aos resultados retornados, não ao tamanho da coleção inteira.

**Why this priority**: caminho frequente do produto. Cada busca textual hoje carrega coleção inteira (2588 rows). Múltiplas buscas em sessão de uso multiplicam o custo. Ataca o gargalo identificado no diagnóstico em prod.

**Independent Test**: instrumentação `[DB]` ativa em prod. Carregar `/?q=joao` deve gerar 1 SELECT records com LIMIT 50 (não retornar 2588 rows). Cobertura accent-insensitive preservada — busca por "acucar" encontra "Açúcar Amargo".

**Acceptance Scenarios**:

1. **Given** DJ autenticado com coleção de ~2588 records, **When** carrega `/?q=joao`, **Then** o sistema executa 1 query SQL contra a tabela de discos retornando no máximo 50 rows (paginação SQL ativa) — proporcional ao tamanho da página, não ao tamanho da coleção.

2. **Given** DJ digita "açúcar" na barra de busca, **When** a página recarrega com a busca, **Then** discos cujo artista, título ou label contenha "Açúcar" (qualquer combinação de acentos) aparecem nos resultados — cobertura accent-insensitive preservada.

3. **Given** DJ digita "joao gilberto" (minúsculas, sem acento), **When** busca executa, **Then** discos de "João Gilberto" aparecem (cobertura case-insensitive + accent-insensitive).

4. **Given** DJ tem busca textual ativa e troca de página (`?q=joao&page=2`), **When** carrega a página 2, **Then** o sistema executa 1 query com OFFSET 50 LIMIT 50 (paginação SQL eficiente).

5. **Given** instrumentação ativa, **When** DJ carrega `/` com busca, **Then** logs mostram ZERO queries que escaneiam a coleção inteira para depois filtrar em memória.

---

### User Story 2 - Sync mantém busca atualizada automaticamente (Priority: P2)

Quando o sync incremental do Discogs adiciona novos records ou atualiza metadados existentes, a busca textual deve refletir os dados novos imediatamente — sem necessidade de backfill manual ou cron de reconciliação.

**Why this priority**: garante que feature funcione corretamente em fluxo contínuo. Sem isso, busca fica desatualizada após cada sync.

**Independent Test**: forçar sync manual via `/status` ou cron diário. Após sync, novos records devem aparecer em busca relevante.

**Acceptance Scenarios**:

1. **Given** sync incremental adiciona um novo record com artist "Marisa Monte", **When** sync conclui, **Then** o campo de busca do record contém versão normalizada de "Marisa Monte" (e busca por "marisa" encontra esse record).

2. **Given** sync atualiza metadados de um record existente (ex: título corrigido pelo Discogs), **When** sync conclui, **Then** o campo de busca reflete o título novo, não o antigo.

3. **Given** import inicial de 2500+ records, **When** import termina, **Then** todos os records têm campo de busca preenchido — não há records "invisíveis" para busca textual.

---

### User Story 3 - Backfill popula records existentes sem perder cobertura (Priority: P2)

Records criados antes desta feature têm o campo de busca vazio. Um backfill 1× via script deve popular todos os records existentes para que a busca funcione corretamente desde o primeiro deploy.

**Why this priority**: feature não funciona até backfill rodar. Migration prod sem backfill = busca retorna 0 resultados.

**Independent Test**: rodar backfill em prod via env var. Verificar via SQL que `search_text` está populado para 100% dos records do user.

**Acceptance Scenarios**:

1. **Given** migration prod aplicada (coluna nova com default vazio), **When** mantenedor roda script de backfill com env de prod, **Then** todos os records têm `search_text` populado com versão normalizada de artist+title+label.

2. **Given** backfill concluído, **When** DJ busca por qualquer artista existente em prod, **Then** resultados aparecem corretamente — não há "buracos" em records antigos.

3. **Given** backfill é idempotente, **When** rodar 2 vezes, **Then** segundo run não causa erros nem duplicações; apenas re-confirma valores.

---

### Edge Cases

- **Record sem label** (label = NULL): campo de busca contém apenas `artist + title`. Busca por palavras do label retorna 0 (esperado).
- **Termos com pontuação ou caracteres especiais** (ex: "Sigur Rós", "Kraftwerk!"): normalização remove diacríticos mas preserva pontuação. Busca por "sigur ros" encontra; busca por "kraftwerk" encontra.
- **Termos compostos** (ex: "rolling stones"): SQL `LIKE '%rolling stones%'` casa contra string completa. Não há ranking — qualquer ocorrência é match.
- **Termo vazio** (`?q=` ou `?q= `): mesmo comportamento de hoje (sem text filter, paginação SQL completa).
- **Record arquivado** (archived=true): não aparece em busca (filtro `archived=false` continua aplicado).
- **Coleção crescer pra 10k+ records**: index em `(user_id, search_text)` mantém busca rápida (mesmo que LIKE com `%termo%` seja menos eficiente que prefix-match, ainda é ordens de magnitude melhor que JS scan da tabela inteira).
- **Mudança de label/artist/title via Discogs sync**: campo é re-computado no UPDATE, busca atualiza.
- **Backfill rodando enquanto DJ usa app**: script é idempotente; UPDATE em massa não bloqueia leitura concurrentes (SQLite WAL).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST armazenar uma versão pre-normalizada (lowercase + sem diacríticos) dos campos textuais de cada disco (artista, título, label) em uma coluna dedicada da tabela de discos, para permitir busca SQL eficiente.

- **FR-002**: A coluna de busca MUST ser indexada por (usuário, valor) para permitir paginação SQL em consultas com filtro textual.

- **FR-003**: Toda inserção de novo disco via sincronização externa (sync Discogs incremental, import inicial) MUST computar e gravar o valor da coluna de busca usando a mesma normalização (lowercase + remoção de diacríticos) usada nas consultas.

- **FR-004**: Toda atualização de campos textuais existentes (artista, título, label) via sincronização externa MUST recalcular e atualizar a coluna de busca para refletir os novos valores.

- **FR-005**: O caminho de consulta de busca textual em listagens (home, sorteio aleatório de unrated, candidatos para set) MUST aplicar o filtro de texto via SQL (LIKE/comparação de string contra a coluna pre-normalizada), não em pós-processamento JavaScript.

- **FR-006**: O termo digitado pelo DJ MUST ser normalizado (mesmo algoritmo de lowercase + remoção de diacríticos) antes de ser usado como argumento da consulta SQL — garantindo paridade de cobertura com o estado armazenado.

- **FR-007**: Quando termo de busca está ativo, a paginação SQL (LIMIT/OFFSET) MUST ser aplicada — a consulta retorna no máximo o tamanho de página configurado (50 records).

- **FR-008**: Quando termo de busca está vazio ou ausente, comportamento atual de paginação SQL MUST ser preservado (já funciona desde Inc 22).

- **FR-009**: A cobertura da busca insensitive a acentos MUST ser preservada — DJ digita "acucar" e encontra "Açúcar"; digita "joao" e encontra "João"; digita "sergio" e encontra "Sérgio". Bidirecional.

- **FR-010**: A cobertura da busca insensitive a maiúsculas MUST ser preservada — DJ digita "JOAO" ou "JoAo" e encontra "João Gilberto".

- **FR-011**: Records criados antes desta feature MUST ser populados via script de backfill 1× (rodado pelo mantenedor com credenciais de produção). Sem backfill, esses records não aparecem em buscas.

- **FR-012**: O script de backfill MUST ser idempotente — rodar múltiplas vezes não causa erros, duplicações ou divergências.

- **FR-013**: Após validação em produção, o caminho antigo de filtro JS pós-query (que carregava coleção inteira) MUST ser removido do código — incluindo a flag de "omitir filtro de texto" no helper de filtros e o pós-processamento JS.

- **FR-014**: A função de normalização de texto (lowercase + remoção de diacríticos) MUST permanecer disponível como helper compartilhado, usada tanto na escrita (computar coluna de busca) quanto na leitura (normalizar termo do DJ antes da consulta).

- **FR-015**: A migration de schema MUST adicionar a coluna com valor default vazio para records existentes — backfill atualiza posteriormente. Coluna é não-nullable.

### Key Entities

- **Disco (record)**: ganha um novo atributo `search_text` (texto pre-normalizado para busca eficiente). Atributo é derivado de `artist + title + label` via função de normalização. Não é editável pelo DJ — é zona SYS, atualizado apenas por sincronização externa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O número de rows lidas em uma consulta com busca textual ativa cai de ~2588 (coleção inteira) para no máximo 50 (tamanho de página), medido via instrumentação nos logs do hospedador.

- **SC-002**: A cobertura de busca insensitive a acentos é 100% equivalente à versão atual — todos os termos que retornavam resultados antes da feature continuam retornando os mesmos resultados (mesma lista, mesma ordem).

- **SC-003**: Tempo de resposta de busca textual em coleção de 2500+ records cai de ~2-3 segundos (carregamento + filtro JS) para abaixo de 500ms (paginação SQL com index).

- **SC-004**: Em uso solo intenso (DJ faz 20+ buscas textuais por dia em sessão de curadoria), o consumo total de row reads associado a buscas cai de ~50.000/dia para abaixo de 1.000/dia (-98%).

- **SC-005**: Projeção para 5 usuários (mesmo padrão de uso) mantém consumo associado a buscas abaixo de 5.000 reads/dia, ≤ 0.001% do free tier mensal de 500M.

- **SC-006**: Após backfill, 100% dos records existentes têm o campo de busca populado — verificável via consulta `SELECT COUNT(*) WHERE search_text = ''` retornando 0 (ou apenas records de teste/edge cases conhecidos).

- **SC-007**: Não há regressão de comportamento observável para o DJ — buscas que retornavam X resultados antes continuam retornando os mesmos X resultados após a feature.

- **SC-008**: O sync incremental e o import inicial mantêm o campo de busca atualizado automaticamente — DJ não precisa de intervenção manual após adicionar novos records ao Discogs.

## Assumptions

- Vercel Hobby permanece o ambiente de execução; cota Turso free tier (500M reads/mês) é o teto a respeitar.
- Mantenedor é único usuário ativo em prod no curto prazo; projeção para 5-10 amigos é o alvo.
- Helper de normalização (`normalizeText`) já existe desde Inc 18 (021-accent-insensitive-search) — não precisa ser reimplementado, apenas reutilizado.
- Apenas 2 caminhos de escrita tocam `artist`/`title`/`label` em records: `applyDiscogsUpdate` (sync incremental) e `runInitialImport` (import inicial). DJ não edita esses campos diretamente — são zona SYS desde Inc 001.
- A função `normalizeText` é determinística (Unicode NFD + remoção de marcas diacríticas + lowercase). Mesma input → mesmo output. Pode rodar em SQL via aplicação Node ou em JS conforme contexto.
- SQL `LIKE '%termo%'` em coluna indexada não usa o index para o `%` à esquerda (full scan dentro do user_id), mas mesmo assim é ordens de magnitude mais rápido que JS pós-query (SQLite scan + page-cache vs. transferência de 2588 rows pra Lambda + JS filter).
- Coluna `search_text` é não-nullable com default vazio. Records antigos têm `''` até backfill rodar — esse é o motivo da ordem: migration → backfill → deploy de código.
- Esta feature é parcialmente reversível: a coluna nova pode ser dropada via migration reversa se necessário (Inc 34 ou similar). O código antigo (JS post-filter) é removido nesta feature; reverter exigiria recuperar via git history.
- Eficiência de busca em coleção 10k+ records: aceita-se que LIKE `%termo%` ainda escaneia rows do user (filtro `archived=false` + `user_id=?` reduz drasticamente o conjunto). Performance pode ser revisitada em Inc futuro com FTS5 (full-text search SQLite) se virar gargalo.
- A feature é coordenada com Inc 33 (futuro) que vai criar `user_vocab` dedicada — esta feature foca apenas em busca textual em records, não em vocabulário (moods/contexts/genres/styles/shelves).
