# Implementation Plan: UI rework das sugestões IA (inline na lista de candidatos)

**Branch**: `015-ai-suggestions-inline` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/015-ai-suggestions-inline/spec.md](./spec.md)

## Summary

Refator de orquestração + visual em `/sets/[id]/montar`. Hoje a
listagem é renderizada server-side pelo RSC e o `<AISuggestionsPanel>`
client component renderiza sua própria lista interna abaixo do
briefing. Mudanças:

1. **Reposicionar**: painel de sugestões move pra baixo dos filtros
   (apenas reordenar JSX no RSC).
2. **Lista única**: criar wrapper client `<MontarCandidates>` que
   recebe `candidates` (do server) + `inSetIds` + `aiConfigured` +
   `setId` e mantém estado local de sugestões. Renderiza lista
   única: dedupe trackIds das sugestões, renderiza sugestões IA no
   topo (com prop `aiSuggestion` no `<CandidateRow>`) seguidas dos
   candidatos comuns. Botões "Sugerir" e "Ignorar" no header.
3. **Visual destacado**: estender prop `aiSuggestion` em
   `<CandidateRow>` pra renderizar moldura accent + bg sutil +
   badge maior + justificativa em `text-[15px]` com `text-ink`.

`<AISuggestionsPanel>` antigo é removido (lógica absorvida pelo
`<MontarCandidates>`). Server Action `suggestSetTracks` permanece
intacta. `addTrackToSet` permanece intacta.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15, Drizzle ORM, Clerk; **adapter de IA do Inc 14**, **`<CandidateRow>` existente**, **`suggestSetTracks` do Inc 14**
**Storage**: SQLite/Turso. **Sem schema delta.**
**Testing**: Verificação manual via `npm run dev` + `npm run build`. Sem suíte automatizada.
**Target Platform**: Web (Vercel + Turso, Node.js 20+)
**Project Type**: single Next.js project (`src/`)
**Performance Goals**: Reset via "Ignorar sugestões" ≤200ms (SC-004 — operação 100% client-side, zero round-trip).
**Constraints**:
- Princípio I — sem mudança de comportamento de escrita.
- Princípio II — Server Components por padrão; novo wrapper client justificado por estado de sugestões + interatividade.
- Princípio III — sem schema delta.
- Reusa `suggestSetTracks` (Inc 14), `addTrackToSet`, `<CandidateRow>` (Inc 14 já tem prop `aiSuggestion`).

**Scale/Scope**:
- 1 componente novo: `<MontarCandidates>` (client wrapper)
- `<AISuggestionsPanel>` removido
- `<CandidateRow>` extensão visual da prop `aiSuggestion` (moldura + bg + badge maior + justificativa em destaque)
- Reordenação de JSX em `/sets/[id]/montar/page.tsx`

## Constitution Check

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | Refator puramente visual + de orquestração. Zero mudança em Server Actions de escrita. `addTrackToSet` permanece o único caminho. |
| **II. Server-First por Padrão** | OK | Listagem continua server-rendered no RSC. Novo `<MontarCandidates>` é client component justificado: precisa manter estado local de sugestões em memória sem persistir, reagir a botões "Sugerir"/"Ignorar"/"Adicionar" sem refresh server-side. RSC continua carregando candidates iniciais. |
| **III. Schema é a Fonte da Verdade** | OK | Zero schema delta. |
| **IV. Preservar em Vez de Destruir** | OK | "Ignorar sugestões" reseta apenas estado client (memória). Set + candidatos preservados. Re-gerar pede confirmação (Inc 14 mantido). |

**Restrições técnicas**: nenhuma nova lib.

**Veredito**: passa sem violação.

## Project Structure

### Documentation (this feature)

```text
specs/015-ai-suggestions-inline/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── contracts/
│   └── components.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
src/
├── components/
│   ├── candidate-row.tsx                   # Extensão visual da prop aiSuggestion
│   ├── montar-candidates.tsx               # NOVO — client wrapper que orquestra estado de sugestões
│   └── ai-suggestions-panel.tsx            # REMOVIDO — lógica absorvida pelo wrapper
└── app/
    └── sets/[id]/montar/
        └── page.tsx                        # Reordenar JSX (filtros antes do bloco de sugestões+listagem)
                                            # Substituir <CandidateRow>.map + <AISuggestionsPanel> por <MontarCandidates />
```

**Structure Decision**: novo componente client `<MontarCandidates>`
absorve a responsabilidade de orquestração. Isso simplifica o page
RSC (passa props simples) e mantém toda lógica reativa em um lugar.
`<AISuggestionsPanel>` é deletado (UX do Inc 14 fica obsoleta).

## Phase 0: Outline & Research

1 questão resolvida em `/speckit.clarify` (dedup). Decisões técnicas
remanescentes em [research.md](./research.md):

1. Wrapper client (`<MontarCandidates>`) vs subir estado pra page wrapper — escolha de arquitetura
2. Cores/tokens exatos do destaque visual (border-accent, bg-paper-raised vs accent/5, justificativa text-[15px] text-ink)
3. Posição dos botões "Sugerir"/"Ignorar" — header dedicado vs inline com título "Candidatos"
4. Estratégia de dedup (Set lookup vs filter)
5. Comportamento ao adicionar uma sugestão: card permanece visível com flag (já vem do CandidateRow)

## Phase 1: Design & Contracts

- **data-model.md**: estado client + props.
- **contracts/components.md**: assinatura do `<MontarCandidates>` + extensão visual do `<CandidateRow>`.
- **quickstart.md**: cenários manuais (lista única, dedup, ignorar, mobile, set populado, etc).
- **CLAUDE.md**: marker SPECKIT atualizado.

## Complexity Tracking

> Sem violações. Tabela vazia.
