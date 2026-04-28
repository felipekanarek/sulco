# Implementation Plan: Configuração de IA do DJ (BYOK)

**Branch**: `012-ai-byok-config` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/012-ai-byok-config/spec.md](./spec.md)

## Summary

Schema delta de 3 colunas em `users` (`ai_provider`, `ai_model`,
`ai_api_key_encrypted`) + tela em `/conta` (seção "Inteligência
Artificial") + adapter pattern em `src/lib/ai/`. Reusa o mesmo
`encryptPAT`/`decryptPAT` (AES-256-GCM via `MASTER_ENCRYPTION_KEY`)
do PAT do Discogs. 3 Server Actions: `testAndSaveAIConfig`
(testar+salvar atômico, FR-005), `removeAIConfig`, e helper read-only
`getUserAIConfig`. Inc 13 e Inc 1 vão consumir o adapter via
`enrichTrackComment(prompt)` no futuro — esta feature entrega só a
infra.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15 (RSC + Server Actions), Drizzle ORM, `@libsql/client`, Zod, Clerk; **+ SDKs novos**: `@google/generative-ai` (Gemini), `@anthropic-ai/sdk`, `openai` (compatível com OpenAI/DeepSeek/Qwen via baseURL custom)
**Storage**: SQLite (dev) / Turso (prod) via `@libsql/client`. Schema delta = 3 colunas nullable em `users`.
**Testing**: Verificação manual via `npm run dev` + `npm run build`. Sem suíte automatizada.
**Target Platform**: Web (Vercel + Turso, Node.js 20+)
**Project Type**: single Next.js project (`src/`)
**Performance Goals**: Ping test ≤5s normal (SC-002), timeout 10s (Q3). Server Actions ≤60s (trivial aqui).
**Constraints**:
- Princípio I respeitado (`ai_*` é zona SYS, não AUTHOR).
- Princípio II respeitado (Server Actions com Zod; tela é mix de RSC + 1 form client interativo).
- Reusa criptografia existente (Q1) — sem nova env var.
- Sem chave em texto puro em logs/responses/UI (FR-004, SC-003).
- Custo de manutenção: lista de modelos hardcoded; modelo deprecado pelo provider exige PR de remoção.

**Scale/Scope**: 1 schema delta (3 colunas), 3 Server Actions novas, 1 helper read-only, 1 tela em `/conta` (seção dedicada), 5 adapters (Gemini, Anthropic, OpenAI, DeepSeek, Qwen — sendo os 3 últimos compartilhando base via `openai` SDK).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | `ai_provider`, `ai_model`, `ai_api_key_encrypted` são zona SYS (credencial de integração externa). Não tocam campos AUTHOR (`status`, `notes`, curadoria de tracks). Apenas o próprio DJ escreve via tela em `/conta`. |
| **II. Server-First por Padrão** | OK | Tela `/conta` é Server Component (lê config do DB no server). Form de salvar/testar/remover é client component (interatividade real: input + estado pendente + feedback). Server Actions em `src/lib/actions.ts` validadas com Zod. `revalidatePath('/conta')` no fim de cada action. |
| **III. Schema é a Fonte da Verdade** | OK | Coluna nova em `src/db/schema.ts` (3 colunas). Aplicar via Turso CLI em prod (mesmo procedimento dos Inc 010 — workaround do drizzle-kit interativo). Tipos derivados via `$inferSelect`. |
| **IV. Preservar em Vez de Destruir** | OK | "Trocar provider apaga key" é ação explícita do DJ (Q2 da clarificação). Confirmação obrigatória antes (US2 acceptance scenario 1). Sem auto-delete por evento externo. |

**Restrições técnicas**:
- 3 SDKs novos no `package.json`. Justificável: API oficial de cada provider; sem alternativa razoável de "1 SDK pra todos" (LangChain/Vercel AI SDK adicionam complexidade sem ganho aqui — temos chamada simples de chat completion). DeepSeek e Qwen reusam `openai` SDK com `baseURL` diferente.
- Sem libs proibidas (Zustand, shadcn, Prisma).

**Veredito**: passa sem violação.

## Project Structure

### Documentation (this feature)

```text
specs/012-ai-byok-config/
├── plan.md                              # Este arquivo
├── spec.md                              # Spec (já criada + clarificada)
├── research.md                          # Decisões técnicas (Phase 0)
├── data-model.md                        # Schema delta + entidades derivadas
├── contracts/
│   ├── server-actions.md                # Contratos das 3 actions + helper
│   └── ai-adapter.md                    # Interface comum dos providers
├── quickstart.md                        # Validação manual
└── tasks.md                             # Phase 2 (gerado por /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                        # +3 colunas em users
├── lib/
│   ├── crypto.ts                        # Adicionar aliases encryptSecret/decryptSecret
│   ├── actions.ts                       # +testAndSaveAIConfig, +removeAIConfig
│   └── ai/
│       ├── index.ts                     # getUserAIConfig + enrichTrackComment (interface comum)
│       ├── models.ts                    # Lista curada de modelos por provider
│       ├── types.ts                     # Tipos compartilhados (Provider, ModelOption, AIConfig)
│       └── providers/
│           ├── gemini.ts                # Adapter Gemini (SDK próprio)
│           ├── anthropic.ts             # Adapter Anthropic (SDK próprio)
│           └── openai-compat.ts         # Adapter OpenAI/DeepSeek/Qwen (1 código, 3 baseURLs)
├── components/
│   └── ai-config-form.tsx               # Client component interativo (form)
└── app/
    └── conta/
        └── page.tsx                     # Server Component, +seção "Inteligência Artificial"
```

**Structure Decision**: single Next.js project. Diretório novo
`src/lib/ai/` agrupa adapter pattern; `crypto.ts` ganha aliases
genéricos pra evitar usar `encryptPAT` semanticamente errado. Tela
em `/conta` (já existe) ganha seção, sem rota nova.

## Phase 0: Outline & Research

Sem `[NEEDS CLARIFICATION]` na spec (4 questões resolvidas em
`/speckit.clarify`). Decisões técnicas remanescentes pra resolver
em [research.md](./research.md):

1. Endpoint/payload exato do ping pra cada provider
2. baseURL exato de DeepSeek e Qwen (OpenAI-compat)
3. Lista curada de modelos com data de revisão
4. Estratégia de detecção de erros do provider (parsing de mensagem
   pra mapear "key inválida" vs "modelo inválido" vs "rate limit")
5. Aliases `encryptSecret`/`decryptSecret` em `crypto.ts`

## Phase 1: Design & Contracts

- **data-model.md**: schema delta + entidade `UserAIConfig` (derivada
  pela leitura via helper).
- **contracts/server-actions.md**: 3 Server Actions + 1 helper.
- **contracts/ai-adapter.md**: interface comum `AIAdapter` que todos
  os 5 providers implementam.
- **quickstart.md**: cenários manuais (config inicial com cada um dos
  5 providers, troca de provider, remoção, key revogada).
- **CLAUDE.md**: marker SPECKIT atualizado.

## Complexity Tracking

> Sem violações. Tabela vazia.
