<!--
Sync Impact Report
==================
Version change: 1.1.0 → 1.2.0
Bump rationale (MINOR): adição do Princípio V — Mobile-Native por
Padrão. Motivado por falha de UX no modal de edição de set
(Inc 016 EditSetModal): modal centrado com overlay funciona
tecnicamente em mobile mas com navegação estranha — sintoma de
adaptação tardia em vez de design mobile-first. Princípio formaliza
a obrigação de pensar mobile desde a spec, não como adaptação
posterior.

Histórico:
- 1.0.0 (initial ratification): 4 princípios + Restrições Técnicas.
- 1.1.0 (Inc 013): `tracks.aiAnalysis` incluído em Princípio I.
- 1.2.0 (Inc 016 follow-up): adiciona Princípio V — Mobile-Native
  por Padrão.

Modified principles:
- (nenhum existente alterado)

Added principles:
- V. Mobile-Native por Padrão

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — sem mudança estrutural
  necessária (Constitution Check é genérico e referencia princípios
  por construção; novo princípio é checado automaticamente em PRs
  com UI).
- ✅ .specify/templates/spec-template.md — sem mudança estrutural
  (princípio orienta CONTEÚDO de FR/Edge/SC, não seções).
- ✅ .specify/templates/tasks-template.md — sem mudança.
- ✅ .specify/templates/checklist-template.md — sem mudança.

Follow-up TODOs:
- Nenhum.
-->

# Sulco Constitution

## Core Principles

### I. Soberania dos Dados do DJ (NON-NEGOTIABLE)

Campos autorais pertencem ao usuário e nunca são sobrescritos por fontes externas.

- Os campos `status`, `shelfLocation` e `notes` de `records`, bem como todos os campos de
  curadoria de `tracks` (`selected`, `bpm`, `musicalKey`, `energy`, `moods`, `contexts`,
  `fineGenre`, `references`, `comment`, `aiAnalysis`), MUST ser soberanos do DJ.
  `aiAnalysis` é AUTHOR híbrido: IA escreve via clique explícito do DJ (ato intencional),
  e DJ pode editar livremente como `comment`. Não é escrito por sync de fonte externa.
- Sincronizações com o Discogs MUST apenas popular/atualizar campos originários do Discogs
  (`discogsId`, `artist`, `title`, `year`, `label`, `country`, `format`, `genres`, `styles`,
  `coverUrl`, e `position`/`title`/`duration` de faixas).
- Qualquer código que escreva em campos autorais a partir de fonte externa MUST ser
  recusado na revisão.

**Rationale**: O valor do Sulco é a curadoria acumulada do DJ. Perdê-la por acidente de sync
anula o produto inteiro.

### II. Server-First por Padrão

Server Components e Server Actions são o default. Cliente exige justificativa explícita.

- Todo componente novo MUST ser Server Component a menos que requeira interatividade JS
  real (estado local dinâmico, eventos de input complexos, APIs do browser).
- Mutações MUST viver em `src/lib/actions.ts` como Server Actions, validadas com Zod e
  concluídas com `revalidatePath` nas rotas afetadas.
- Não MUST haver API routes (`/api/*`) para operações que possam ser Server Actions.

**Rationale**: Elimina camada de API desnecessária, mantém formulários funcionais sem JS e
preserva a simplicidade arquitetural escolhida.

### III. Schema é a Fonte da Verdade

O modelo de dados é definido em um único lugar e acessado via query builder tipado.

- `src/db/schema.ts` (Drizzle) MUST ser a única definição autoritativa do modelo.
- Queries MUST usar o query builder do Drizzle; SQL raw é permitido SOMENTE para
  agregações complexas com justificativa inline no código.
- Alterações de schema MUST ser aplicadas via `npm run db:push` e refletidas nos tipos
  TypeScript antes de qualquer código consumidor ser escrito.

**Rationale**: Garante consistência entre banco, tipos e código; evita drift e queries
quebradas silenciosamente.

### IV. Preservar em Vez de Destruir

Dados curatoriais não são deletados silenciosamente por eventos externos.

- Se um disco sair da coleção no Discogs, o sistema MUST arquivar o registro e sinalizar
  conflito ao usuário, nunca deletar.
- Se uma faixa for removida do Discogs, o sistema MUST marcar conflito preservando os
  campos autorais, nunca apagar.
- Operações de delete físico MUST exigir ação explícita do usuário na UI.

**Rationale**: Curadoria é patrimônio acumulado ao longo de anos. Qualquer perda
automatizada é inaceitável.

### V. Mobile-Native por Padrão

Toda funcionalidade de UI MUST ser especificada considerando ativamente a experiência
mobile, não apenas como adaptação responsiva da versão desktop.

- Specs com UI nova MUST documentar o comportamento mobile (≤640px) em pelo menos uma
  seção (Functional Requirements, Edge Cases ou Success Criteria).
- Quickstart MUST incluir ≥1 cenário de validação mobile quando há componentes visuais
  novos ou alterados.
- Padrões nativos mobile (fullscreen sheets para modals, bottom sheets para filtros,
  drawers para navegação) DEVEM ser preferidos sobre adaptações de UI desktop quando a
  interação justifica.
- Tap targets MUST ter ≥ 44×44 px (Inc 009 baseline).
- Decisões de UI que ignorem mobile MUST ser justificadas explicitamente na spec ou
  plan.

**Rationale**: Sulco é usado em estúdio (desktop) e na rua/loja de discos (mobile).
Sessão 2026-04-28 (Inc 016 EditSetModal) revelou modal centrado que funciona tecnicamente
mas com navegação estranha em mobile — sintoma de adaptação tardia em vez de design
mobile-first. Princípio garante que mobile seja considerado desde a especificação, não
como retrofit pós-implementação.

## Restrições Técnicas

Stack fixa enquanto esta constituição vigorar:

- Framework: Next.js 15 (App Router, RSC).
- Linguagem: TypeScript em modo strict.
- Banco: SQLite via `@libsql/client` + Drizzle ORM.
- Validação: Zod em todos os inputs de Server Actions.
- Estilo: Tailwind CSS v3 + CSS variables.
- Runtime: Node.js 20+.

Proibido enquanto esta constituição vigorar:

- Redux, Zustand ou qualquer store global de estado cliente.
- Prisma, TypeORM ou outros ORMs concorrentes ao Drizzle.
- `better-sqlite3` (uso exclusivo de `@libsql/client`).
- shadcn/ui ou bibliotecas de componentes genéricas nesta fase.

Qualquer desvio MUST ser justificado em documento de decisão e aprovado via emenda
constitucional (bump MINOR ou MAJOR conforme o caso).

## Governance

Esta constituição supersede práticas e preferências ad-hoc. Todo PR e revisão MUST
verificar conformidade com os princípios acima.

Procedimento de emenda:

1. Propor a mudança em PR dedicado alterando `.specify/memory/constitution.md`.
2. Atualizar `CONSTITUTION_VERSION` seguindo SemVer:
   - **MAJOR**: remoção ou redefinição incompatível de princípio/governança.
   - **MINOR**: adição de princípio/seção ou expansão material de diretriz.
   - **PATCH**: clarificações, correções de redação, refinamentos não semânticos.
3. Atualizar `LAST_AMENDED_DATE` para a data da emenda (ISO `YYYY-MM-DD`).
4. Propagar ajustes necessários em `.specify/templates/*.md` e documentação de runtime
   (`README.md`, `CLAUDE.md`) no mesmo PR.

Revisão de conformidade: qualquer complexidade adicionada MUST ser justificada contra os
princípios. Guia de runtime para desenvolvimento operacional vive em `CLAUDE.md`.

**Version**: 1.2.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-28
