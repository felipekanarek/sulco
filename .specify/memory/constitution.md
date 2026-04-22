<!--
Sync Impact Report
==================
Version change: template → 1.0.0
Bump rationale: Initial ratification of the Sulco Constitution (first formal version).

Modified principles:
- [PRINCIPLE_1_NAME] → I. Soberania dos Dados do DJ (NON-NEGOTIABLE)
- [PRINCIPLE_2_NAME] → II. Server-First por Padrão
- [PRINCIPLE_3_NAME] → III. Schema é a Fonte da Verdade
- [PRINCIPLE_4_NAME] → IV. Preservar em Vez de Destruir
- [PRINCIPLE_5_NAME] → (omitido — 4 princípios no total)

Added sections:
- Restrições Técnicas

Removed sections:
- Placeholder [SECTION_3_NAME] (Development Workflow) — intencionalmente omitido a pedido do mantenedor.

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — Constitution Check permanece genérico; princípios aplicáveis via referência.
- ✅ .specify/templates/spec-template.md — sem conflito de seções obrigatórias.
- ✅ .specify/templates/tasks-template.md — sem conflito de categorização.
- ✅ .specify/templates/checklist-template.md — sem referências a princípios antigos.

Follow-up TODOs:
- Nenhum.
-->

# Sulco Constitution

## Core Principles

### I. Soberania dos Dados do DJ (NON-NEGOTIABLE)

Campos autorais pertencem ao usuário e nunca são sobrescritos por fontes externas.

- Os campos `status`, `shelfLocation` e `notes` de `records`, bem como todos os campos de
  curadoria de `tracks` (`selected`, `bpm`, `musicalKey`, `energy`, `moods`, `contexts`,
  `fineGenre`, `references`, `comment`), MUST ser soberanos do DJ.
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

**Version**: 1.0.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-22
