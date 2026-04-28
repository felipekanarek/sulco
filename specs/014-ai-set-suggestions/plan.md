# Implementation Plan: Briefing com IA em /sets/[id]/montar

**Branch**: `014-ai-set-suggestions` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/014-ai-set-suggestions/spec.md](./spec.md)

## Summary

Server Action nova `suggestSetTracks(setId)` orquestra: (a)
ownership do set, (b) carrega briefing + faixas em set_tracks +
catálogo elegível via `queryCandidates(userId, filters, inSetIds)`
existente, (c) trunca catálogo em 50 priorizando faixas mais
bem-curadas, (d) monta prompt multi-linha (L1 briefing, L2 set
atual completo, L3 catálogo, L4 instrução pedindo JSON), (e) chama
`enrichTrackComment` (Inc 14) com `Promise.race(60s)`, (f) parse
JSON defensivo (extrai bloco JSON de prosa envolvente), (g) filtra
trackIds inválidos/duplicados, (h) retorna `{ ok, suggestions:
[{trackId, justificativa}] }`.

UI: bloco vertical novo entre briefing e listagem manual em
`/sets/[id]/montar`. Reusa `<CandidateRow>` com prop opcional
`aiSuggestion?: { justificativa: string }` que adiciona badge
"✨ Sugestão IA" + texto em itálico abaixo dos metadados. Botão
"✨ Sugerir com IA" no header do bloco. Estado client mantém lista
de sugestões; cards adicionados ganham flag visual mas não somem.

Sem schema delta.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15, Drizzle ORM, `@libsql/client`, Zod, Clerk; **adapter de IA do Inc 14** (`src/lib/ai/`); **prompt builder pattern do Inc 13** (em `src/lib/prompts/`)
**Storage**: SQLite/Turso. **Sem schema delta.** Reusa `sets`, `set_tracks`, `tracks`, `records`.
**Testing**: Verificação manual via `npm run dev` + `npm run build`. Sem suíte automatizada.
**Target Platform**: Web (Vercel + Turso, Node.js 20+)
**Project Type**: single Next.js project (`src/`)
**Performance Goals**: Geração tipicamente ≤30s (FR-014). Hard timeout 60s via `Promise.race` (mais generoso que Inc 13 pelo tamanho do prompt).
**Constraints**:
- Princípio I — IA NÃO escreve em `set_tracks`. Apenas sugere; DJ executa adição via `addTrackToSet` (existente, já valida ownership).
- Princípio II — Server Action nova com Zod; client component novo apenas pra interatividade (estado das sugestões + handlers).
- Princípio III — sem schema delta.
- Reusa `enrichTrackComment` do Inc 14, `queryCandidates` do `montar.ts`, `addTrackToSet` existente.

**Scale/Scope**:
- 1 Server Action nova (`suggestSetTracks`)
- 1 prompt builder novo em `src/lib/prompts/set-suggestions.ts`
- Extensão do `<CandidateRow>` com prop opcional `aiSuggestion`
- 1 client component novo `<AISuggestionsPanel>` que orquestra estado das sugestões
- Update do RSC `src/app/sets/[id]/montar/page.tsx` pra incluir o painel + passar `aiConfigured`
- Parse JSON defensivo (helper `parseAISuggestionsResponse`)

## Constitution Check

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | IA não escreve em `set_tracks` — apenas sugere `trackId`s. DJ confirma cada adição via clique que dispara `addTrackToSet` (existente). Princípio I respeitado por construção. |
| **II. Server-First por Padrão** | OK | `suggestSetTracks` é Server Action validada com Zod. RSC `/sets/[id]/montar` lê `aiConfigured` via `getUserAIConfigStatus`. Painel é client component (justificado: estado de sugestões em memória + handlers). |
| **III. Schema é a Fonte da Verdade** | OK | Zero schema delta. Apenas leitura. |
| **IV. Preservar em Vez de Destruir** | OK | IA NUNCA propõe remover faixas (FR-010). Re-gerar com confirmação preserva sugestões pendentes (FR-009). |

**Restrições técnicas**: nenhuma nova lib. Reusa SDKs do Inc 14.

**Veredito**: passa sem violação.

## Project Structure

### Documentation (this feature)

```text
specs/014-ai-set-suggestions/
├── plan.md                              # Este arquivo
├── spec.md                              # Spec (já clarificada, 3Qs)
├── research.md                          # Decisões técnicas (Phase 0)
├── data-model.md                        # Entidades reusadas + state client
├── contracts/
│   ├── server-actions.md                # suggestSetTracks
│   └── ai-prompt.md                     # Builder + parse defensivo
├── quickstart.md                        # Validação manual
└── tasks.md                             # Phase 2 (gerado por /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── actions.ts                       # +suggestSetTracks
│   ├── ai/
│   │   └── (sem mudança — reusa enrichTrackComment do Inc 14)
│   ├── prompts/
│   │   ├── track-analysis.ts            # (existe, Inc 13)
│   │   └── set-suggestions.ts           # NOVO — buildSetSuggestionsPrompt + parseAISuggestionsResponse
│   └── queries/
│       └── montar.ts                    # SEM mudança — reusa queryCandidates(userId, filters, inSetIds)
├── components/
│   ├── candidate-row.tsx                # +prop opcional aiSuggestion
│   └── ai-suggestions-panel.tsx         # NOVO — client component, estado + handlers
└── app/
    └── sets/[id]/montar/
        └── page.tsx                     # +carrega aiConfigured, +renderiza <AISuggestionsPanel>
```

**Structure Decision**: arquivo novo `src/lib/prompts/set-suggestions.ts`
isola montagem de prompt + parse JSON (testáveis sem inicializar IA).
`<AISuggestionsPanel>` é orquestrador client (estado + chamada da
action); cards individuais reusam `<CandidateRow>` com badge.

## Phase 0: Outline & Research

3 questões resolvidas em `/speckit.clarify`. Decisões técnicas
remanescentes em [research.md](./research.md):

1. Formato exato do JSON de resposta + extração defensiva (anti-fragilidade contra prosa envolvente)
2. Critério de "mais bem-curadas" pra truncamento server-side em 50
3. Posição visual exata do badge "✨ Sugestão IA" no `<CandidateRow>`
4. Estado client: como sinalizar card "✓ adicionada" sem perder a lista
5. Re-geração: confirmação `window.confirm` (mesmo pattern Inc 13/14)
6. Tratamento de catálogo vazio (curto-circuito antes de chamar IA)

## Phase 1: Design & Contracts

- **data-model.md**: entidades reusadas + estado client `AISuggestion[]`.
- **contracts/server-actions.md**: assinatura de `suggestSetTracks`.
- **contracts/ai-prompt.md**: estrutura do prompt L1-L4 + schema JSON esperado + helper `parseAISuggestionsResponse`.
- **quickstart.md**: cenários manuais (set vazio, set populado anti-duplicação, filtros respeitados, catálogo zerado, falha provider, multi-user).
- **CLAUDE.md**: marker SPECKIT atualizado.

## Complexity Tracking

> Sem violações. Tabela vazia.
