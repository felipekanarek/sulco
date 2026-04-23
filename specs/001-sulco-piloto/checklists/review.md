# Checklist: Revisão Pré-Implementação — Sulco Piloto

**Purpose**: "Unit tests for requirements" — validar qualidade, clareza e
consistência dos requisitos antes de `/speckit-implement`. Cobre quatro eixos:
conformidade com a Constituição, segurança/privacidade, integridade do sync
Discogs, e coerência cross-artifact (spec ↔ plan ↔ data-model ↔ contracts).

**Created**: 2026-04-22
**Focus**: Comprehensive (E — constitution + security + sync + cross-artifact)
**Depth**: Formal gate
**Audience**: Autor (pré-implement) + Reviewer (futuro PR)

Marque os itens concluídos com `[x]`. Todo item `[Gap]` ou `[Ambiguity]` que
sobrar vira um TODO de spec/plan antes de prosseguir.

---

## Requirement Completeness

- [x] CHK001 - Estão todos os 49 FRs (FR-001..FR-049, incluindo sub-variantes FR-017a/b/c, FR-024a, FR-034a, FR-037a/b) documentados no spec? [Completeness, Spec §Requirements]
- [x] CHK002 - Cada User Story (US1–US4) declara explicitamente seu Independent Test? [Completeness, Spec §User Stories]
- [x] CHK003 - O fluxo de onboarding (Clerk sign-up → username Discogs → PAT → import inicial) está especificado em ordem não-ambígua como um FR (ou referenciado num FR)? [Completeness, Spec §FR-050] — resolvido adicionando FR-050
- [x] CHK004 - O painel `/status` (FR-040) tem requisitos definidos sobre quantas execuções de sync exibir e com qual ordenação? [Completeness, Spec §FR-040] — últimas 20 por `startedAt desc`
- [x] CHK005 - Existe requisito sobre retenção do histórico de `syncRuns` (tempo, número máximo, purge)? [Completeness, Spec §FR-039] — cresce sem purge
- [x] CHK006 - Existe requisito sobre limites de tamanho máximo para `notes`, `briefing`, `comment`, `references`, `fineGenre`? [Completeness, Spec §FR-017d] — 5000 chars em todos
- [x] CHK007 - Existe requisito sobre limite máximo de faixas por set? [Completeness, Spec §FR-029a] — 300 faixas
- [x] CHK008 - O comportamento quando `coverUrl` do Discogs quebra no futuro está especificado? [Edge Case, Spec §Edge Cases] — placeholder + Reimportar no card
- [x] CHK009 - O comportamento da UI durante o primeiro render pós-onboarding (coleção vazia enquanto import roda) está definido? [Coverage, Spec §US1]
- [x] CHK010 - Há requisitos para mensagens de erro específicas em cada ponto de falha do onboarding (PAT inválido, username inexistente, Discogs fora do ar)? [Completeness, Spec §FR-051] — resolvido adicionando FR-051

## Requirement Clarity

- [x] CHK011 - O termo "tempo real" em FR-030 e US1-2 está quantificado (ex: intervalo de atualização, polling, streaming)? [Clarity, Spec §FR-030] — polling 3s
- [x] CHK012 - "Progresso em tempo real (`X de Y discos`)" em US1 especifica qual X/Y (já importados vs. total anunciado pelo Discogs)? [Clarity, Spec §US1] — Y = total da primeira página do Discogs
- [x] CHK013 - "Aviso persistente" em FR-036 e FR-045 está definido visualmente (banner, badge, toast, modal) e em qual(is) rota(s)? [Clarity, Spec §FR-045] — banner horizontal abaixo do header, global, consistente
- [x] CHK014 - "Confirmação explícita" em FR-043 está precisada (é digitar "APAGAR" OU o email, não ambos)? [Clarity, Spec §FR-043] — "ou" já é claro; decisão de UX
- [x] CHK015 - "Em condições normais" em SC-004 e SC-009 está objetivamente definido (rede estável? quantos discos?)? [Measurability, Spec §SC-004, §SC-009] — "sem falhas de rede, Discogs operacional, rate limit não atingido"
- [x] CHK016 - "Autocomplete baseado nos existentes do usuário somado às sementes" em FR-017a especifica a ordem de exibição quando há colisão? [Clarity, Spec §FR-017a] — dedup + DJ por frequência, depois sementes alfa
- [x] CHK017 - "Debounce razoável" em FR-024a está quantificado? [Clarity, Spec §FR-024a] — 400ms
- [x] CHK018 - O comportamento do botão "Reimportar" quando o cooldown ainda está ativo está definido na UI (apenas desabilitar? mostrar contador? tooltip)? [Clarity, Spec §FR-034a] — estático "Aguarde ~60s"

## Requirement Consistency

- [x] CHK019 - FR-001 exige autenticação para qualquer rota não-landing/login — isso é consistente com existência de `/api/cron/sync-daily` e `/api/webhooks/clerk` (que não são do usuário)? [Consistency, Spec §FR-001, Plan §Complexity Tracking] — exceções documentadas; auth é por CRON_SECRET/HMAC
- [x] CHK020 - O status do set como campo DERIVADO (FR-028) é consistente com as User Stories/cenários que antes falavam em "mudar status" manualmente? [Consistency, Spec §US3 Scenario 7, §FR-028] — cenários foram reescritos na sessão 4
- [x] CHK021 - A semântica AND de filtros multivalorados (FR-024) é consistente entre `/curadoria`, `/` (listagem) e `/sets/[id]/montar`? [Consistency, Spec §FR-006, §FR-024] — `/curadoria` intencionalmente só filtra por status no piloto; outros filtros podem vir em iteração futura
- [x] CHK022 - O filtro Bomba tri-estado (FR-006, FR-024) usa os mesmos três rótulos na listagem de discos e na montagem de set? [Consistency, Spec §FR-006, §FR-024] — uniformizado `qualquer / apenas Bomba / sem Bomba`
- [x] CHK023 - "Sem export" em Assumptions contradiz, ou não, requisitos implícitos em backup/recuperação? [Consistency, Spec §Assumptions] — decisão consciente, documentada
- [x] CHK024 - A notação Camelot (FR-017b) é a notação usada em TODAS as telas de filtro/exibição (não há fallback para notação tradicional em lugar algum)? [Consistency, Spec §FR-017b] — regex + picker único
- [x] CHK025 - `energy` é declarada como `1–5` em FR-017 e FR-024, e como `[1,5]` no data-model (faixa inteira) — há consistência entre spec e data-model quanto à obrigatoriedade/nullabilidade? [Consistency, Spec §FR-017, §FR-020a] — resolvido adicionando FR-020a (apagar valor = null; sem afetar selected)

## Acceptance Criteria Quality

- [x] CHK026 - Cada Success Criterion (SC-001..SC-010) é objetivamente verificável sem depender de opinião humana? [Measurability, Spec §Success Criteria] — resolvido após remoção de SC-005
- [x] CHK027 - SC-005 ("90% dos discos `active` terminam com ≥1 faixa `selected`") tem janela de medição definida (por sessão? cumulativo? 30 dias)? [Clarity, Spec §SC-005] — SC-005 removido do piloto (indicador de uso, não requisito)
- [x] CHK028 - SC-001 (onboarding < 2 min) tem ponto de início claramente definido (abertura da landing vs. clique em "Entrar")? [Clarity, Spec §SC-001] — "após abrir a landing"
- [x] CHK029 - Cada Acceptance Scenario de US1–US4 usa padrão Given/When/Then e cobre um caminho testável? [Completeness, Spec §User Stories] — todos os 27 cenários seguem o padrão
- [x] CHK030 - SC-008 ("zero casos de sobrescrita") tem teste de integração nominado em algum artefato (research, contracts) que implemente a verificação? [Traceability, Spec §SC-008, Research §9, Quickstart §9] — `tests/integration/sync-preserves-author-fields.test.ts`

## Coverage Gaps — Scenarios & Edge Cases

- [x] CHK031 - Requisitos para "recovery flow" quando o Discogs está totalmente fora do ar durante o onboarding existem? [Coverage, Spec §FR-052] — resolvido: conta pendente indefinidamente, retry manual
- [x] CHK032 - Requisitos para quando o usuário altera o PAT enquanto sync está em andamento existem? [Coverage, Spec §FR-053] — resolvido: sync em andamento usa token antigo; próximo sync usa novo
- [x] CHK033 - Requisitos para fuso horário do DJ que toca fora do Brasil (DST americano, turnê em outro fuso) existem? [Coverage, Spec §Assumptions] — fora do escopo declarado
- [x] CHK034 - Requisitos para o caso "Vercel Cron não disparou em um dia" (SLO de agendamento) estão definidos? [Coverage, Spec §Assumptions] — best-effort declarado; sem SLO formal
- [x] CHK035 - Requisitos para o caso "pouco espaço em disco do Turso/libsql" estão definidos? [Coverage, Spec §Assumptions] — volume projetado ≤500MB (tier gratuito)
- [x] CHK036 - Requisitos para migração de dados entre usuários (transferir coleção de uma conta para outra) estão explicitamente FORA DE ESCOPO? [Boundary, Spec §Assumptions] — declarado fora do piloto

## Non-Functional Requirements

- [x] CHK037 - Requisitos de **performance** (SC-002, SC-004, SC-006, SC-009) estão quantificados com metas numéricas? [Clarity, Spec §Success Criteria]
- [x] CHK038 - Requisitos de **acessibilidade** (FR-047..FR-049) especificam ferramenta/método de verificação (axe-core? lighthouse? manual?)? [Measurability, Spec §FR-049a] — verificação manual via DevTools em telas críticas; sem CI gate
- [x] CHK039 - Requisitos de **segurança** para o PAT (cifragem at-rest) estão no spec (FR-004) E detalhados em algoritmo em research.md — algum detalhe está só no research e não no spec, gerando risco de esquecer? [Traceability, Spec §FR-004, Research §3] — spec fica abstrato (cifrado at-rest); detalhes no research são autoritativos pra impl
- [x] CHK040 - Requisitos de **disponibilidade** (uptime/SLO) do serviço estão explicitamente declarados ou explicitamente OUT-OF-SCOPE? [Coverage, Spec §Assumptions] — best-effort declarado em Assumptions
- [x] CHK041 - Requisitos de **observabilidade** exigidos por FR-039..FR-041 têm contrato definido de **shape dos logs** (ex: JSON estruturado com campos obrigatórios)? [Completeness, Spec §FR-039, Research §5] — shape fica no research como guideline; não vira FR (piloto single-user não audita logs)

## Dependencies & Assumptions

- [x] CHK042 - A suposição "usuário tolera ~45min de import" (SC-002/Assumptions) é validada ou apenas declarada? [Assumption, Spec §Assumptions] — ratificada pelo próprio DJ do piloto
- [x] CHK043 - A dependência de Clerk webhook `user.deleted` chegar (entrega garantida?) está documentada como assumption? [Dependency, Spec §Assumptions] — retry ~24h via Svix; risco residual aceito sem reconciliação
- [x] CHK044 - A dependência do Vercel Cron ter confiabilidade suficiente está documentada? [Dependency, Spec §Assumptions] — best-effort declarado
- [x] CHK045 - A proibição de `shadcn/ui` (Constituição) é consistente com a decisão de não usar shadcn mas usar `@dnd-kit` (permitido por não ser lib de componentes genéricos)? [Constitution, Consistency] — @dnd-kit é lib utilitária de comportamento, não de componentes visuais

## Constitution Alignment

- [x] CHK046 - Princípio I (Soberania dos Dados do DJ): Existe teste ou invariante automatizada que falhe o build/CI se alguma Server Action ou função de sync escrever em campo autoral? [Constitution, Spec §FR-054] — resolvido adicionando FR-054 (teste obrigatório bloqueia merge)
- [x] CHK047 - Princípio II (Server-First): As exceções documentadas (webhook Clerk + cron endpoint) são JUSTIFICADAS em Complexity Tracking com motivo que NÃO é conveniência? [Constitution, Plan §Complexity Tracking] — razões estruturais externas (HMAC svix, Vercel Cron HTTP-only)
- [x] CHK048 - Princípio III (Schema Fonte da Verdade): O data-model.md e o `src/db/schema.ts` atual estão em sincronia — ou há gap reconhecido (ex: remoção de `sets.status` ainda por fazer)? [Consistency, data-model.md] — divergências mapeadas; alinhamento é a primeira task do implement. `curated/curatedAt/rating` promovidos a FR-020b/020c
- [x] CHK049 - Princípio IV (Preservar em vez de destruir): Toda operação de DELETE em qualquer contrato (server-actions, cron, webhook) requer consentimento explícito do usuário? [Constitution, Contracts §server-actions.md] — auditado: deleteAccount/removeTrackFromSet/resolveTrackConflict(discard) todos com confirmação; sync NEVER deleta

## Cross-Artifact Coherence

- [x] CHK050 - Toda entidade do data-model.md tem correspondente no spec §Key Entities (sem entidade surpresa no plano)? [Consistency] — correspondência completa
- [x] CHK051 - Todo FR do spec tem pelo menos um contrato (Server Action, endpoint, ou função interna) que o implementa? [Coverage] — todos mapeados; FR-054 é meta-requirement (vira task, não contrato)
- [x] CHK052 - Toda decisão de research.md é referenciada (ou ao menos compatível) em alguma parte de plan.md ou contracts/? [Traceability] — 10 decisões todas refletidas
- [x] CHK053 - Os rótulos das rotas em spec.md (`/curadoria`, `/sets/novo`, etc.) são EXATAMENTE os mesmos usados em plan.md §Project Structure? [Consistency] — rotas de spec batem; plan adiciona `/status`, `/conta`, `/onboarding`, `/api/*` como decisões de plan
- [x] CHK054 - A lista de dependências em plan.md §Technical Context menciona TODAS as libs citadas nos contratos (svix, @dnd-kit, @clerk/nextjs, @libsql/client, zod, drizzle-orm)? [Completeness, Plan] — todas presentes

## Ambiguities & Conflicts a Resolver

- [x] CHK055 - "Vocabulary seeds" — research.md §7 propõe embutir em código (`DEFAULT_MOOD_SEEDS`); data-model.md §Seeds propõe injetar no primeiro disco do seed. Há conflito? [Conflict, Research §7 vs data-model.md §Seeds] — resolvido: constantes em `src/lib/vocabulary.ts` são fonte única; seed.ts não duplica
- [x] CHK056 - "Primeira página do sync anterior" em contracts/discogs-client.md §runDailyAutoSync menciona payload extra em `syncRuns.lastCheckpointPage`, mas data-model.md descreve `lastCheckpointPage` só como `int`. Há conflito ou subespecificação? [Consistency] — resolvido: adicionada coluna `syncRuns.snapshotJson` (JSON) para lista de discogsIds; `lastCheckpointPage` fica só para retomada de import
- [x] CHK057 - A tabela `playlists` permanece no schema — existe requisito explícito de que ela NÃO deve ser exibida na UI? [Completeness, Spec §FR-053a] — resolvido adicionando FR-053a
- [x] CHK058 - "Aguarde 60s" em FR-034a sugere contagem regressiva visível; o contrato `reimportRecord` retorna `cooldownRemaining: N` — a UI tem FR que exija exibir esse número? [Completeness, Spec §FR-034a] — resolvido em CHK018: texto estático sem número dinâmico

## Traceability

- [x] CHK059 - Existe esquema de IDs para Acceptance Criteria por US (ex: US1-AC1, US1-AC2) que permita rastrear de teste → critério → FR? [Traceability, Spec §User Scenarios] — convenção `US{N}-AC{M}` documentada no topo da seção
- [x] CHK060 - Todo SC tem pelo menos um FR associado que, se cumprido, implica o SC? [Traceability, Spec §Success Criteria] — mapeamento auditado: SC-001..SC-010 todos com FR(s) cobridor(es)

---

**Metrics (pós-revisão)**:
- Total itens: 60
- Itens fechados: 60 (100%)
- FRs novos adicionados durante revisão: FR-020a, FR-020b, FR-020c, FR-029a,
  FR-017d, FR-049a, FR-050, FR-051, FR-052, FR-053, FR-053a, FR-054 (12 FRs)
- Ajustes em FRs existentes: FR-006, FR-017a, FR-020, FR-024, FR-024a, FR-030,
  FR-034a, FR-039, FR-040, FR-045
- SCs removidos: SC-005 (indicador de uso, não requisito de entrega)
- Artefatos tocados: spec.md, data-model.md, contracts/server-actions.md,
  contracts/discogs-client.md

**Status final**: spec/plan/data-model/contracts coerentes e sem ambiguities,
gaps ou conflicts abertos de impacto material. Piloto está pronto para
`/speckit-tasks`.
