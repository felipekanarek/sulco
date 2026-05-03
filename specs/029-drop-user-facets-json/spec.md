# Feature Specification: Cleanup pós-vocab — drop de colunas mortas

**Feature Branch**: `029-drop-user-facets-json`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Inc 34 — Drop colunas `*Json` em `user_facets` (cleanup pós-Inc 33). Após Inc 33 introduzir `user_vocab` e migrar todos os 5 readers de vocabulário, as 5 colunas JSON em `user_facets` (`genresJson`, `stylesJson`, `moodsJson`, `contextsJson`, `shelvesJson`) ficaram MORTAS — escritas mas zero leitores. Cleanup direto: remove as colunas, enxuga o tipo `UserFacets`, deleta 3 helpers privados redundantes (`aggregateFacet`/`aggregateVocabulary`/`aggregateShelves`), e simplifica `recomputeFacets`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mantenedor lê o schema sem ruído (Priority: P1)

Felipe (mantenedor) abre `src/db/schema.ts` ou `src/lib/queries/user-facets.ts` pra entender o que vive em `user_facets`. Não há mais referências a colunas que não são lidas em lugar nenhum. Cada campo da tabela tem caller ativo. O modelo de dados reflete a realidade pós-Inc 33.

**Why this priority**: schema é a fonte da verdade (Princípio III). Manter colunas mortas viola o princípio implicitamente — qualquer leitor da spec pensa que existe algum caso de uso quando não existe. Remover dead code reduz carga cognitiva permanente.

**Independent Test**: pode ser testado lendo `user_facets` em `src/db/schema.ts` — apenas counters numéricos + timestamp + chave do user. Tipo `UserFacets` em `src/lib/queries/user-facets.ts` reflete a mesma estrutura. Nenhum grep retorna referência aos nomes `genresJson`/`stylesJson`/`moodsJson`/`contextsJson`/`shelvesJson` em código ativo.

**Acceptance Scenarios**:

1. **Given** Inc 34 deployado, **When** mantenedor inspeciona `user_facets` no schema, **Then** apenas campos `userId`, contadores de records (total/active/unrated/discarded), `tracksSelectedTotal` e `updatedAt` aparecem. Zero colunas JSON.
2. **Given** Inc 34 deployado, **When** `grep -rn "genresJson\|stylesJson\|moodsJson\|contextsJson\|shelvesJson" src/`, **Then** retorna zero ocorrências em código ativo.
3. **Given** Inc 34 deployado, **When** mantenedor lê o tipo `UserFacets`, **Then** o tipo expõe apenas counters + metadata, sem campos de listas.

---

### User Story 2 - Sistema continua funcional após o cleanup (Priority: P1)

Todas as funcionalidades existentes continuam intactas: chip pickers carregam, filtros funcionam, contadores de coleção batem, sync incremental atualiza counters, archive decrementa vocab corretamente.

**Why this priority**: cleanup técnico não pode introduzir regressão funcional. Inc 33 já validou `user_vocab` como fonte autoritativa; este Inc apenas remove caminho fallback que ninguém mais usa.

**Independent Test**: smoke test pós-deploy — abrir `/`, `/sets/[id]/montar`, `/disco/[id]`, `/status` e confirmar que pickers de moods/contexts/genres/styles/shelves estão populados; contador de coleção (total/ativos/etc.) bate; edição de mood/shelf persiste.

**Acceptance Scenarios**:

1. **Given** Inc 34 deployado, **When** DJ abre `/`, **Then** picker de gêneros/estilos mostra a mesma lista de antes do deploy + contador da coleção mostra mesmos valores.
2. **Given** Inc 34 deployado, **When** DJ edita mood numa track, **Then** mudança persiste e picker reflete (Inc 33 path intacto).
3. **Given** Inc 34 deployado, **When** sync diário roda, **Then** counters em `user_facets` (`recordsTotal`, `recordsActive`, `tracksSelectedTotal`, etc.) são atualizados corretamente.

---

### User Story 3 - Recomputação fica mais barata (Priority: P2)

A função de recomputação periódica (chamada pelo cron diário e por sincronizações em massa) deixa de calcular agregações que alimentavam as colunas mortas. Roda apenas o que ainda é útil: counters + repopulação de `user_vocab`.

**Why this priority**: ganho marginal em reads (cron diário roda 1×/user/dia). Vale o cleanup pra simplificar a função e reduzir helpers dead code, mas não é o motivo principal do Inc 34.

**Independent Test**: rodar `recomputeFacets` manualmente em prod (via cron disparo ou disparo de sync) e comparar logs `[DB]` antes vs depois. Esperado: ~5 SELECTs a menos por run.

**Acceptance Scenarios**:

1. **Given** Inc 34 deployado, **When** cron diário dispara `recomputeFacets`, **Then** logs mostram queries de counters + queries de repopulação de vocab. Sem queries adicionais de agregação para alimentar colunas removidas.
2. **Given** Inc 34 deployado, **When** mantenedor inspeciona `recomputeFacets`, **Then** lê apenas chamadas a agregadores de counters + repopulação de vocab. Helpers privados que alimentavam JSON removidos.

---

### Edge Cases

- **Migration aplicada antes do code deploy**: código atual ainda lê as colunas via `parseJsonArray(row.genresJson, [])`. Sem coluna, o driver pode retornar erro. Mitigação: rodar code deploy ANTES da migration (código novo não lê as colunas; tabela velha tem colunas extras que são ignoradas).
- **Migration aplicada depois do code deploy mas antes de `recomputeFacets` rodar**: aceitável — código novo só escreve nos campos preservados. Próximo cron passa a escrever só counters.
- **Algum caller esquecido lendo `getUserFacets().genres` ou similar**: prevenir via grep auditando todos os 5 nomes (`.genres`, `.styles`, `.moods`, `.contexts`, `.shelves`) no resultado de `getUserFacets`. Se aparecer, migrar pra `listVocab` antes do deploy.
- **Reversão necessária**: revert do commit + `ALTER TABLE user_facets ADD COLUMN ... DEFAULT '[]'`. Custo baixo — reversibilidade garantida via Princípio IV.
- **Falha em DROP COLUMN**: SQLite/libsql moderno suporta nativamente, mas se houver erro inesperado (ex: trigger antigo, view dependente), abortar e investigar antes de prosseguir.
- **Cron rodando durante migration**: race possível mas sem efeito — INSERT em `user_facets` com colunas que não existem mais lança erro, capturado pelo try/catch existente, e o cron tenta de novo no dia seguinte (drift transitório aceitável).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST remover do schema da tabela `user_facets` as 5 colunas dedicadas a listas de vocabulário (gêneros, estilos, moods, contextos, prateleiras).
- **FR-002**: Sistema MUST preservar em `user_facets` as colunas de counters (records total/active/unrated/discarded e tracks_selected_total) + chave do user + timestamp de atualização.
- **FR-003**: Tipo `UserFacets` exposto pelo módulo de queries MUST refletir o schema enxuto (zero campos de listas).
- **FR-004**: Função pública `getUserFacets(userId)` MUST continuar retornando estrutura compatível com callers que dependem APENAS dos counters (`collectionCounts`, `countSelectedTracks`).
- **FR-005**: Função pública `recomputeFacets(userId)` MUST continuar funcional, atualizando os counters preservados e repopulando o vocabulário materializado (`user_vocab`).
- **FR-006**: Sistema MUST remover helpers privados que alimentavam exclusivamente as colunas removidas (agregadores de gêneros/estilos/moods/contextos/prateleiras escritos pra JSON columns).
- **FR-007**: Helpers privados que alimentam `user_vocab` (count agregadores criados no Inc 33) MUST permanecer — usados pela repopulação.
- **FR-008**: Migration em produção MUST remover as 5 colunas da tabela `user_facets` em ambiente Turso.
- **FR-009**: Ordem de deploy MUST ser **(a) deploy de código primeiro, (b) migration depois** — código novo não depende das colunas, tabela velha tem colunas extras ignoradas. Inversão pode quebrar transitoriamente.
- **FR-010**: Sistema MUST manter feature isomórfica — comportamento observável pelo DJ é exatamente o mesmo antes e depois (pickers, contadores, edições).
- **FR-011**: Não há backfill — apenas remoção de colunas + ajuste de tipo.
- **FR-012**: Reversão MUST ser viável via revert do commit + ALTER TABLE ADD COLUMN restaurando defaults vazios.

### Key Entities

- **`user_facets` enxuto**: tabela de metadados agregados por usuário. Após cleanup, contém apenas:
  - **Usuário** (`user_id`): chave de identificação, FK pra users com cascade delete.
  - **Contadores de records**: total, ativos, não avaliados, descartados — todos integers ≥0.
  - **Contador de tracks selecionadas**: integer ≥0.
  - **Última atualização** (`updated_at`): timestamp Unix.
  - Listas de termos NÃO ficam aqui — vivem em `user_vocab` (Inc 33).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após o deploy, `grep -rn "genresJson\|stylesJson\|moodsJson\|contextsJson\|shelvesJson" src/` retorna zero ocorrências em código ativo (zero referências às colunas removidas).
- **SC-002**: Tipo `UserFacets` reflete schema enxuto — número de campos cai de 12 (5 listas + 5 counters + userId + updatedAt) para 7 (counters + userId + updatedAt). Verificável via inspeção do tipo.
- **SC-003**: 100% das funcionalidades existentes funcionam idênticas após o deploy: chip pickers populados, contadores corretos, edições persistem. Verificado via smoke manual em todas as rotas autenticadas.
- **SC-004**: Build TypeScript passa zero erros após remoção dos campos do tipo. Verificável via `npm run build`.
- **SC-005**: Função `recomputeFacets` executa com 5 SELECTs a menos por run em comparação com baseline pré-Inc 34 (eliminação dos 5 agregadores que alimentavam JSON columns). Verificável via instrumentação `[DB]` em logs.
- **SC-006**: Sistema continua dentro da cota gratuita do banco compartilhado. Reversão viável via revert + ALTER TABLE ADD COLUMN se algo crítico falhar.

## Assumptions

- Inc 33 (`user_vocab`) está deployado em prod e validado (entregue em 2026-05-03).
- Todos os 5 readers de vocabulário (`listUserGenres`, `listUserStyles`, `listUserShelves`, `listSelectedVocab`, `listUserVocabulary`) já consomem `listVocab` (não acessam mais campos de lista em `getUserFacets`).
- Backend libsql/Turso suporta `ALTER TABLE DROP COLUMN` nativo (SQLite ≥3.35).
- Mantenedor opera com o ambiente único de produção compartilhado (sem ambiente de staging dedicado) — smoke é a única validação pós-deploy.
- Nenhuma feature futura próxima planeja reusar nomes `genresJson`/`stylesJson`/etc. — caso contrário, manter campo poderia evitar churn.
- Reversibilidade via revert + ALTER TABLE ADD COLUMN é aceitável caso problema apareça no smoke.
- Ordem de deploy "code antes de migration" é a recomendada; janela curta entre deploy e migration é tolerável (cron diário e edições funcionam normalmente).
