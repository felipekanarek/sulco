# Feature Specification: Refatoração UX dos filtros + 5 filtros novos

**Feature Branch**: `032-filter-rework-and-new-fields`
**Created**: 2026-05-03
**Status**: Draft (clarifications resolved 2026-05-03)
**Input**: User description: "Inc 8 — UX rework filtros + 5 novos (Formato, Prateleira, Ano, País, Selo). Genres/Styles viram select picker (substitui lista expandida). Padrão visual chip-style. 5 campos já existem em records (zero schema delta)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - DJ filtra por gênero/estilo via picker (P1)

DJ tem ~30+ gêneros e ~170+ estilos na coleção. Hoje a barra de filtros mostra os 10 mais frequentes + um "ver mais" — pra encontrar gêneros raros, DJ precisa expandir lista longa, escanear visualmente, e marcar. Após o rework, DJ clica em "Gênero" e abre um seletor com TODOS os gêneros da coleção em formato chip — clicáveis pra ativar/desativar — com busca textual interna pra filtrar a lista.

**Why this priority**: hoje o limite de 10 chips visíveis pra coleções grandes (170+ estilos) força UX confuso. Picker dedicado abre espaço pra todos os termos sem poluir a sidebar.

**Independent Test**: abrir `/`, clicar no picker de Gênero → confere que TODOS os gêneros distintos aparecem (não só top 10). Selecionar 2 gêneros → lista de discos se atualiza em ≤500ms.

**Acceptance Scenarios**:

1. **Given** DJ está em `/` com 30+ gêneros distintos na coleção, **When** ele clica no botão "Gênero", **Then** abre overlay/sheet mostrando todos os 30+ gêneros como chips clicáveis, ordenados por frequência DESC.
2. **Given** picker de Gênero aberto, **When** DJ digita "ja" no campo de busca interna, **Then** lista filtra pra mostrar apenas gêneros contendo "ja" (case-insensitive).
3. **Given** DJ selecionou 2 gêneros + 1 estilo, **When** fecha o picker, **Then** filtros são aplicados e lista de discos reflete a interseção.

---

### User Story 2 - DJ filtra por formato (LP / 7" / etc.) (P1)

DJ quer ver apenas LPs (vinis 12"). Aplica filtro "Formato = LP" e a lista mostra exclusivamente LPs.

**Why this priority**: Felipe sinalizou Formato como filtro frequente (separar set por mídia física). Padrão multi-select chip-style.

**Independent Test**: aplicar `?format=LP` em `/`, verificar que lista contém apenas records com `records.format = 'LP'`.

**Acceptance Scenarios**:

1. **Given** DJ tem records com formatos variados (LP, 7", 12", CD, etc.), **When** ele aplica filtro de formato "LP" + "7\"", **Then** lista mostra apenas records com `format IN ('LP', '7"')`.
2. **Given** DJ remove todos os formatos selecionados, **When** o picker fecha, **Then** lista volta a mostrar todos os formatos (sem filtro).

---

### User Story 3 - DJ filtra por prateleira física (P1)

DJ está separando discos pra um evento e quer ver só os da prateleira "E1-P2". Aplica filtro de Prateleira "E1-P2" → lista mostra apenas discos dessa prateleira.

**Why this priority**: alinha filtro com fluxo físico de pegar discos da estante. Reusa estrutura `user_vocab` (Inc 33) que já lista prateleiras distintas.

**Independent Test**: criar 3 records com `shelfLocation` diferentes; aplicar filtro de prateleira → lista correta.

**Acceptance Scenarios**:

1. **Given** DJ tem records em prateleiras "E1", "E2", "E3", **When** ele aplica filtro Prateleira="E1", **Then** lista mostra apenas records com `shelfLocation = 'E1'`.
2. **Given** alguns records têm `shelfLocation = NULL` (sem prateleira), **When** DJ aplica filtro de qualquer prateleira específica, **Then** records sem prateleira NÃO aparecem.

---

### User Story 4 - DJ filtra por ano (P2)

DJ quer ver discos dos anos 70 ou de uma faixa específica de anos. Aplica filtro de ano e lista atualiza.

**Why this priority**: ano é metadata útil pra DJ que mistura por época. Solução adotada: **multi-select de décadas** (Q1=B clarify) — alinhado com chip-style do resto, perde precisão de ano-individual mas cobre 95% dos casos de uso DJ.

**Independent Test**: aplicar filtro de década(s) (ex: "70s" + "80s"), verificar que lista mostra records com `year BETWEEN 1970 AND 1989`.

**Acceptance Scenarios**:

1. **Given** DJ tem records de 1965 a 2024, **When** ele seleciona chips "70s" + "80s", **Then** lista mostra apenas records com `year BETWEEN 1970 AND 1989`.
2. **Given** alguns records têm `year = NULL`, **When** DJ aplica qualquer filtro de década, **Then** records sem ano NÃO aparecem.
3. **Given** picker de Ano aberto, **When** DJ vê as opções, **Then** estão presentes décadas que cobrem o range real da coleção (ex: 50s/60s/70s/80s/90s/00s/10s/20s — apenas décadas com pelo menos 1 record).

---

### User Story 5 - DJ filtra por país de origem (P2)

DJ quer ver apenas discos brasileiros (records.country = "Brazil") ou um conjunto específico de países. Aplica filtro de País como multi-select chip → lista atualiza.

**Why this priority**: país de origem é dimensão útil pra discotecagem temática (ex: set 100% brasileiro, ou só discos americanos).

**Independent Test**: aplicar filtro country="Brazil"; verificar lista.

**Acceptance Scenarios**:

1. **Given** records têm países variados, **When** DJ seleciona País="Brazil" + "USA", **Then** lista mostra apenas records desses dois países.
2. **Given** picker de País mostra todos os países distintos da coleção em ordem alfabética, **When** DJ digita "br" na busca interna, **Then** filtra pra mostrar apenas países contendo "br".

---

### User Story 6 - DJ filtra por selo (label) (P2)

DJ quer ver apenas releases de um selo específico (ex: "Blue Note", "Polydor"). Aplica filtro Selo multi-select → lista atualiza.

**Why this priority**: selos são marcas curatoriais importantes pra DJ; permite explorar discografia de um selo. Coleções típicas têm centenas de selos distintos — picker precisa de busca textual interna.

**Independent Test**: aplicar filtro label="Polydor"; verificar lista.

**Acceptance Scenarios**:

1. **Given** records têm centenas de selos distintos, **When** DJ abre picker de Selo, **Then** lista é apresentada com busca textual proeminente (não apenas chips em scroll longo).
2. **Given** DJ digita "blue" na busca de Selo, **When** lista filtra, **Then** mostra apenas selos com "blue" no nome (case-insensitive).

---

### User Story 7 - DJ combina múltiplos filtros (P3)

DJ aplica filtros compostos (ex: Brasil + LP + Anos 70 + Gênero "Soul" + selo "Polydor") pra encontrar combinação específica. Sistema retorna interseção de todos os critérios.

**Why this priority**: poder de combinação é o valor real dos filtros. Cada novo filtro multiplica capacidade de descoberta.

**Independent Test**: aplicar 4-5 filtros combinados via URL params, verificar resultado.

**Acceptance Scenarios**:

1. **Given** DJ aplica 5 filtros simultâneos via UI, **When** lista renderiza, **Then** retorna apenas records que satisfazem TODOS os filtros (AND entre kinds, OR dentro de cada multi-select).
2. **Given** filtros compostos resultam em zero matches, **When** lista renderiza, **Then** mostra empty state explicando que nenhum disco bate os critérios.

---

### Edge Cases

- **Coleção pequena (10 records)**: pickers mostram apenas valores presentes na coleção. Sem padding artificial.
- **Field NULL** (records.country = NULL, records.year = NULL, etc.): records com campo nulo NÃO aparecem em filtros que exigem aquele campo. Comportamento padrão.
- **Valor único repetido com casing variante**: "Brazil" e "brazil" são tratados como entries distintas (preserva intenção do Discogs). DJ pode mergir manualmente se quiser.
- **Selo com 500+ entries distintos**: picker precisa de busca textual + scroll virtualizado ou top-N + paginação.
- **Mobile**: picker fullscreen via `<MobileDrawer>` (Princípio V) com chips em grid responsivo.
- **URL muito longa** (10+ filtros aplicados): URL search params podem passar de 2KB. Mitigação: navegadores modernos suportam até ~8KB, aceitável.
- **Filtro com ambiguidade entre listas Inc 33 e on-demand DISTINCT**: genres/styles vêm de `user_vocab` (Inc 33 — termos com `ref_count > 0`); format/country/label vêm de SELECT DISTINCT direto. Diferença sutil — termos archived que ainda têm pivot mas não vocab podem aparecer ou não. Aceitável (DJ não percebe).
- **Performance com muitos filtros ativos**: cada filtro adiciona condition no WHERE. Inc 35 já cobriu json_each scans (genres/styles). Filtros novos (format/country/label/year/shelf) são single-column WHERE direto, sem custo adicional.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST oferecer filtros multi-select pra: Gênero, Estilo, Formato, Prateleira, País, Selo.
- **FR-002**: Sistema MUST oferecer filtro por Ano via **multi-select de décadas** (Q1=B): chips com labels "50s", "60s", ..., "20s". Cada chip representa range `year BETWEEN <start> AND <start>+9`. Apenas décadas com ≥1 record aparecem.
- **FR-003**: Filtros multi-select MUST usar padrão visual chip-style (consistente com chips de moods/contexts existentes).
- **FR-004**: Para campos com muitos valores distintos (Gênero, Estilo, Selo), sistema MUST oferecer um seletor que abre overlay/sheet com TODOS os valores da coleção (não apenas top N).
- **FR-005**: Seletor MUST oferecer busca textual interna **condicional** (Q3=B): aparece automaticamente quando o picker tem >20 entries; oculta quando ≤20. Filtragem em tempo real, substring match case-insensitive.
- **FR-006**: Filtros multi-select MUST permitir múltipla seleção; semântica OR dentro do mesmo kind, AND entre kinds diferentes.
- **FR-007**: Lista de valores distintos pra cada kind de filtro MUST refletir apenas valores presentes em records não-arquivados do user.
- **FR-008**: Aplicação de filtro MUST atualizar a URL via search params (state externo / shareable / preserved on refresh).
- **FR-009**: Aplicação de filtro MUST retornar lista atualizada em ≤500ms percebidos pelo DJ em condições normais.
- **FR-010**: Sistema MUST mostrar contador/badge de filtros ativos em cada kind quando aplicável (ex: "Gênero (3)" se 3 gêneros selecionados).
- **FR-011**: Sistema MUST oferecer ação "Limpar todos os filtros" quando ≥1 filtro ativo.
- **FR-012**: Sistema MUST mostrar chips ativos compactos (com botão "x" pra remover individualmente) abaixo do filter bar OU dentro dele — alinhado com `<FilterActiveChips>` existente.
- **FR-013**: Layout do filter bar com 10+ controles MUST adotar **picker buttons compactos** (Q2=A): cada filtro vira um botão na sidebar com label + count quando ativo (ex: "Gênero (3)"). Click no botão abre overlay/sheet com o picker dedicado. Sidebar fica enxuta — sem expansão inline. Inspiração Notion filters.
- **FR-014**: Filtros novos (format/shelf/year/country/label) MUST ser aplicáveis APENAS na home `/` por enquanto. Aplicação em outras telas (ex: `/sets/[id]/montar`) fica fora do escopo deste Inc.
- **FR-015**: Records com campo NULL (sem country, sem year, etc.) MUST NÃO aparecer quando o filtro daquele kind está ativo (comportamento padrão).
- **FR-016**: Sistema MUST preservar todos os filtros existentes (status, text, bomba) sem regressão funcional.
- **FR-017**: Mobile: filtros MUST estar acessíveis via bottom sheet existing (`<FilterBottomSheet>`) com tap targets ≥44×44 px (Princípio V).
- **FR-018**: Combinação de múltiplos filtros (5+) MUST funcionar corretamente — interseção rigorosa entre kinds.

### Key Entities

- **records (existing)**: tabela autoritativa. Campos relevantes pros filtros novos:
  - `format` (TEXT nullable) — DISCOGS metadata (LP, 7", 12", CD, etc.).
  - `country` (TEXT nullable) — DISCOGS metadata.
  - `label` (TEXT nullable) — DISCOGS metadata.
  - `year` (INTEGER nullable) — DISCOGS metadata.
  - `shelfLocation` (TEXT nullable) — AUTHOR (DJ define).

- **user_vocab (existing — Inc 33)**: lista de termos materializados. Reusada pra Gênero/Estilo/Prateleira (3 dos 6 multi-selects).

- **Listas distinct on-demand**: pra Format/Country/Label, sistema computa lista de valores únicos sob demanda via consulta agregada cached (request-scoped).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ consegue aplicar filtro novo (format/shelf/year/country/label) em ≤3 cliques (abrir picker → selecionar → fechar).
- **SC-002**: Picker de Gênero exibe 100% dos gêneros distintos da coleção (não apenas top 10).
- **SC-003**: Filtro composto (5 kinds simultâneos) retorna lista correta em ≤500ms percebidos pelo DJ.
- **SC-004**: Lista de valores distintos pra cada novo kind (format/country/label) carrega em ≤200ms percebidos (cached request-scoped).
- **SC-005**: Custo em rows lidas pelo banco por load com filtros novos é equivalente ao baseline pré-Inc 8 (~1.7k rows pós-Inc 35) — filtros novos não introduzem regressão.
- **SC-006**: Mobile: filter bar funciona via bottom sheet em viewport ≤640px com pickers totalmente acessíveis. Tap targets ≥44px (Princípio V).
- **SC-007**: Build TypeScript passa zero erros após adição dos 5 filtros + refator pickers.
- **SC-008**: Zero regressão em filtros existentes (status, text, bomba, gênero, estilo).
- **SC-009**: URL search params preservam estado completo dos filtros — refresh recarrega filtros aplicados.
- **SC-010**: Empty state contextual quando combinação de filtros retorna zero matches (mensagem clara, não tela em branco).

## Assumptions

- Todas as 5 colunas (`format`, `country`, `label`, `year`, `shelfLocation`) já existem em `records` (verificado em `src/db/schema.ts` linhas 78-82, 89). Sem schema delta.
- Listas distinct pra format/country/label são pequenas (~30-100 entries) — query SELECT DISTINCT cached é suficiente sem materializar em `user_vocab`.
- Genres/Styles/Shelves já estão materializados em `user_vocab` (Inc 33) — reusa `listVocab(userId, kind)`.
- Padrão visual chip-style alinha com tags existing (moods, contexts) — DJ não precisa aprender novo padrão.
- Filtros novos APENAS em home `/`. Aplicação em `/sets/[id]/montar` fica como Inc futuro se houver demanda.
- Inc 35 (pivot tables) cobre filtros de gêneros/estilos com index direto. Filtros novos (format/country/label single-column) ficam no caminho otimizado existing (filter dentro de `(user_id, archived)` index).
- Sem indexes adicionais necessários pra escala atual (~2.6k records). Decidir no plan se vale criar preventivamente.
- Mobile usa bottom sheet existing (`<FilterBottomSheet>`) — sem novo padrão UI.

---

## Clarifications

### Session 2026-05-03

**Round 1 — UX clarifications**:
- Q1: Modelo de input para filtro de Ano? → **B (multi-select de décadas)** — alinhado com chip-style; chips só pra décadas com ≥1 record na coleção.
- Q2: Layout do filter bar com 10+ controles (desktop)? → **A (picker buttons compactos + overlay)** — sidebar enxuta; cada filtro vira botão com label + count, abre picker dedicado on click.
- Q3: Padrão de busca interna no picker? → **B (condicional)** — busca aparece quando picker tem >20 entries; oculta quando ≤20. Substring match case-insensitive em tempo real.

**Round 2 — materialização de format/country/label** (após análise EXPLAIN mostrar +10k rows lidas/load se DISTINCT on-demand):
- Decisão arquitetural: **estender `user_vocab` (Inc 33) com 3 kinds novos** (`formats`, `countries`, `labels`). Materialização leve, reusa infra Inc 33. Pickers populam via `listVocab` cached (~30 rows index) em vez de scan completo (~2.6k rows DISTINCT).
- Q4: Como aplicar schema delta no CHECK constraint do enum `kind` (SQLite não suporta ALTER ... DROP/ADD CONSTRAINT)? → **C (remover o CHECK constraint completamente)** — Drizzle enum em TS já valida via tipo + Zod runtime; CHECK era extra-defensivo. Simplicidade compensa.
- Q5: Tratamento de strings vazias em format/country/label vindas do Discogs? → **A (tratar `""` como NULL)** — hook `applyVocabDelta` filtra strings vazias; vocab limpo, picker não mostra chip vazio.
- Q6: Estender `_repopulateVocab` (em `recomputeFacets`) pra agregar 3 novos kinds? → tarefa de implementação automática (não-UX).
