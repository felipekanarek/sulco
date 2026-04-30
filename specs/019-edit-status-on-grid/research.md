# Research — Inc 19: Editar status do disco direto na grid

**Feature**: 019-edit-status-on-grid
**Date**: 2026-04-29

Decisões de design tomadas antes de Phase 1.

---

## Decisão 1 — Componente compartilhado entre as duas views

**Decision**: criar 1 client component
[`<RecordStatusActions>`](../../src/components/record-status-actions.tsx)
usado tanto pelo `<RecordRow>` (view list) quanto pelo
`<RecordGridCard>` (view grid). Mesmo botões, mesmo estado, layout
absorvido pelo container pai.

**Rationale**:
- Lógica de optimistic UI + error lifecycle é idêntica nas 2
  views — duplicar levaria a divergência.
- Componente recebe props mínimas (`recordId`, `status`,
  `recordLabel` para `aria-label`) e expõe layout via classes
  Tailwind passadas pelo pai (ou `className` prop).
- Princípio II (Server-First): único client component novo;
  ambas as views permanecem RSC com o `'use client'` apenas
  na borda interativa.

**Alternatives considered**:
- **Duplicar nos 2 componentes existentes**: rejeitado — drift de
  comportamento garantido a médio prazo.
- **Higher-order: passar handlers via prop e renderizar markup
  no pai**: rejeitado — quebra encapsulamento de
  `useTransition` que pertence ao client component.

---

## Decisão 2 — Optimistic state shape

**Decision**: estado local do `<RecordStatusActions>` segue:

```ts
const [optimistic, setOptimistic] = useState<Status | null>(null);
const [isPending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);
```

`displayStatus = optimistic ?? props.status`. O `optimistic` é
setado imediatamente no clique; em sucesso permanece (até o RSC
re-renderizar com props novos); em erro vira `null` (rollback).

**Rationale**:
- Padrão React 19 (Server Action + transition + estado local).
- `optimistic ?? props.status` permite que o servidor "vença"
  quando re-render chegar — single source of truth eventual.
- Em erro, basta limpar `optimistic` e o badge volta ao
  `props.status` original.
- Sem necessidade de `useOptimistic` (React 19 nativo) porque o
  estado é simples (1 enum); `useState` é mais previsível e não
  requer `<form>`.

**Alternatives considered**:
- **`useOptimistic`**: rejeitado por enquanto — exige Form action
  e o pattern atual do projeto usa Server Actions chamadas
  diretamente via `useTransition`. Consistência > exotismo.
- **Sem optimistic, esperar revalidatePath**: rejeitado — viola
  SC-002 (≤100ms feedback).

---

## Decisão 3 — Error lifecycle e auto-dismiss

**Decision**: estado de erro tem timer auto-dismiss de 5000ms,
limpado ao desmontar ou quando outra ação dispara. Implementação:

```ts
useEffect(() => {
  if (!error) return;
  const t = setTimeout(() => setError(null), 5000);
  return () => clearTimeout(t);
}, [error]);
```

Spec FR-005 + Clarification Q2: "Auto-dismiss após ~5s. Some
também quando DJ clica em outro botão de status".

**Rationale**:
- 5s é tempo suficiente pra DJ ler ("Falha ao atualizar — tente
  novamente") sem poluir.
- Outra ação no mesmo card → setError(null) explícito antes de
  dispará-la (limpa imediato).
- Clarification Q2 cristaliza: sem botão fechar manual.

**Alternatives considered**:
- **Toast global**: rejeitado — projeto não tem toast system;
  introduzir só pra isso é over-engineering. Inline-by-card é
  simples e contextual.
- **Sem timer (persiste até reclique)**: rejeitado por
  Clarification (escolheu auto-dismiss).
- **Timer 3s**: muito curto — DJ pode estar olhando outro card.
  5s é o sweet spot pra erro não-crítico.

---

## Decisão 4 — Layout responsivo dos botões

**Decision**:
- **View list (`<RecordRow>`)**: botões em row horizontal abaixo
  do botão "Curadoria →" na col direita do grid (col 4 em
  desktop, abaixo de StatusBadge em mobile). Cada botão:
  `font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-2
  min-h-[44px] md:min-h-[32px] border ... rounded-sm`.
- **View grid (`<RecordGridCard>`)**: botões em row horizontal
  na parte inferior do card, depois do meta-line (selecionadas /
  shelfLocation). Mesmas classes.

**Rationale**:
- `min-h-[44px]` em mobile satisfaz Princípio V (FR-010).
- `md:min-h-[32px]` em desktop preserva densidade da grid (SC-004
  ±20%) — pattern já validado em Inc 17 (botão de toggle do
  candidato).
- Botões com border + `font-mono uppercase` mantêm a estética
  editorial do projeto.
- Posicionamento: lado direito em list, abaixo em grid card —
  fluxo natural de leitura "info → ação".

**Alternatives considered**:
- **Hover-only desktop**: rejeitado — Felipe já confirmou na spec
  "sempre visível em ambos pra coerência cross-device + simplicidade".
- **Dropdown menu (⋯)**: rejeitado — adiciona 1 clique
  extra; SC-001 quer triagem rápida.
- **Ícones puros (sem texto)**: rejeitado — affordance pior em
  mobile, conflita com regras do Inc 17 (evitar glyphs ambíguos).

---

## Decisão 5 — Cor visual dos botões

**Decision**: botões neutros (border `line` + hover `ink`),
**sem** cor accent ou warn. Igual ao botão `Reconhecer` individual
de archived ([src/components/archived-record-row.tsx](../../src/components/archived-record-row.tsx)).

Estado de execução: `disabled` + `opacity-50` + label "Salvando…"
durante `isPending` (FR-009). Sem spinner — mantém densidade.

**Rationale**:
- Cor accent é reservada pro projeto pra "ação afirmativa única"
  (botão accent vermelho `#a4332a` é raro). Aqui são botões
  rotineiros — neutros mantêm foco no conteúdo (capas, títulos).
- Pattern já existe em outros botões do projeto.
- Visual consistência cross-feature.

**Alternatives considered**:
- **Verde pra `Ativar`, vermelho pra `Descartar`**: rejeitado —
  semáforo viola estética editorial; usuário aprende padrão sem
  cor.
- **Accent só pro `Ativar`**: rejeitado — tira impacto do accent
  pra ação realmente afirmativa.

---

## Decisão 6 — Ordem dos botões quando há múltiplas ações

**Decision**: quando `status='unrated'`, ordem é
**`Ativar` → `Descartar`**, da esquerda pra direita. Sempre nessa
ordem.

**Rationale**:
- Convenção UX: ação primária à esquerda (otimista — manter no
  acervo), secundária à direita (descarte).
- Em pt-BR a leitura natural é esquerda→direita; primeiro
  botão recebe foco preferencial.
- Reduz erro: clique acidental no primeiro botão ativa (caminho
  comum) em vez de descartar.

**Alternatives considered**:
- **`Descartar` à esquerda**: rejeitado — descarte é minoria
  estatística e ação mais "perigosa" perceptualmente.

---

## Decisão 7 — Comportamento "Inbox-zero" pós-mudança (Clarification Q1)

**Decision**: card desaparece da listagem após `revalidatePath`
do RSC (~1s pós-clique). Sem código novo no client — é
comportamento natural do filtro RSC re-aplicado quando o status
muda. Edge case: a action `updateRecordStatus` já chama
`revalidatePath('/')` (verificado em
[src/lib/actions.ts:589](../../src/lib/actions.ts#L589)).

**Rationale**:
- Spec Q1 cristalizou: pattern Inbox-zero é o desejado.
- Reuso do pipeline existente — zero código novo.
- Permanência transiente (entre clique otimistic e re-render) é
  aceita pela spec.

**Alternatives considered**:
- **Animação fade-out 300ms antes de sumir**: rejeitado — over-
  engineering pra uma funcionalidade triagem-rápida; pode revisitar
  como polish futuro se Felipe achar abrupt.
- **Manter card visível com badge novo até refresh manual**:
  rejeitado por Clarification Q1.

---

## Decisão 8 — Discos archived (`records.archived=true`)

**Decision**: `<RecordStatusActions>` NÃO renderiza pra discos
archived. Esse fluxo é separado em `/status` (Inc 11/017 —
"Reconhecer tudo").

**Rationale**:
- Mistura de fluxos confunde: archived é zona SYS (não-deletável,
  preservada por sync), status é AUTHOR.
- DJ que vê archived em `/` (filtro `archived`) vê apenas o
  StatusBadge histórico — pra "reativar" um archived, abre
  `/disco/[id]` (raro, fluxo separado).
- Filtro `archived` da grid já mostra `archivedAt` ao DJ; status
  permanece o último valor antes do archive.

**Alternatives considered**:
- **Mostrar botões mesmo em archived**: rejeitado — UX confuso;
  DJ pode achar que "reativar status" desarchive o disco
  (não é).

---

## Resumo

8 decisões resolvidas — sem NEEDS CLARIFICATION pendentes. Phase
1 procede com:
- 1 contrato em `contracts/ui-contract.md` (especifica visual,
  ARIA, e comportamento de `<RecordStatusActions>`).
- 1 quickstart com cenários cobrindo US1, US2, US3, mobile, a11y.
- Sem `data-model.md` (zero schema delta).
