# Research — Inc 17: Botão "Reconhecer tudo" no banner de archived

**Feature**: 017-acknowledge-all-archived
**Date**: 2026-04-28

Decisões de design tomadas antes de Phase 1. Cada uma resolve uma
NEEDS CLARIFICATION implícita ou ratifica um trade-off que poderia
voltar como dúvida durante implementação.

---

## Decisão 1 — Padrão de confirmação

**Decision**: usar `window.confirm("Marcar todos os N como reconhecidos?")`
nativo do browser. NÃO criar modal próprio.

**Rationale**:
- Reconhecer não é destrutivo (records continuam no DB; só sai banner +
  seção). Nível de risco proporcional ao da confirmação nativa.
- Comportamento do projeto já é consistente: ações verdadeiramente
  destrutivas usam modal próprio (`<DeleteAccountModal>` para deletar
  conta inteira). Ações leves usam confirm nativo (ex: já é o pattern
  esperado para acknowledge).
- Princípio V (Mobile-Native): confirm nativo é fullscreen em iOS/Android
  por padrão. Modal próprio exigiria retrofit fullscreen como aconteceu
  com `<EditSetModal>` em Inc 016.
- Acessibilidade: `window.confirm` é screen-reader-friendly por default.
- Esforço: zero implementação extra de UI.

**Alternatives considered**:
- **Modal próprio inline**: rejeitado — reuso baixo (1 só caller),
  exige retrofit mobile, custo > benefício.
- **Sem confirmação (clique direto executa)**: rejeitado — bulk de
  9 registros é alto demais pra não ter "are you sure". Erro humano
  (clique acidental no botão errado) seria caro de reverter
  (não há undo).
- **Confirmação com input "digite RECONHECER"**: rejeitado — overkill;
  ação não é irreversível catastrófica.

---

## Decisão 2 — Threshold de visibilidade do botão

**Decision**: botão "Reconhecer tudo" renderiza apenas quando
`archivedPending.length >= 2`. Com exatamente 1 pendente, botão NÃO
aparece (botão individual já basta).

**Rationale**:
- UX clean: oferecer "Reconhecer tudo" para 1 disco é redundância
  visual sem ganho funcional.
- Reduz ambiguidade ("clico aqui ou no card?") quando há 1 só item.
- Spec explicitamente alinha (FR-002 + User Story 2 P2).

**Alternatives considered**:
- **Sempre visível**: rejeitado — clutter visual, especialmente
  em mobile.
- **Threshold ≥3**: rejeitado — caso típico reportado (Felipe, 9 discos)
  está claro, mas casos de 2 também merecem atalho. Sem custo extra
  pra cobrir 2.

---

## Decisão 3 — Atomicidade do UPDATE

**Decision**: bulk UPDATE single-statement (`UPDATE records SET
archived_acknowledged_at = ? WHERE user_id = ? AND archived = 1 AND
archived_acknowledged_at IS NULL`). SQLite/Turso garante atomicidade
sem necessidade de `BEGIN TRANSACTION` explícito.

**Rationale**:
- SQLite executa cada statement DML em transação implícita atômica.
- Single-statement evita complexidade de transação manual e edge cases
  de retry parcial.
- Race condition com sync concorrente: se sync arquivar mais discos
  durante a execução, esses NÃO entram no UPDATE corrente (filtro
  `archived_acknowledged_at IS NULL` já estava avaliado). DJ vê
  novos archived na próxima visita — comportamento aceito (edge case
  spec).

**Alternatives considered**:
- **Loop por record com chamada à action individual**:
  rejeitado — N writes, N revalidatePath, terrível performance e
  janela enorme de inconsistência parcial.
- **Transação explícita Drizzle (`db.transaction`)**: rejeitado —
  desnecessária para single-statement; complexidade extra sem ganho.

---

## Decisão 4 — Multi-user isolation

**Decision**: action obtém `userId` da sessão via `requireCurrentUser()`
(helper já existente no projeto). UPDATE inclui `WHERE userId = ?`
junto aos demais filtros.

**Rationale**:
- Pattern já estabelecido em todas as ações de
  [src/lib/actions.ts](../../src/lib/actions.ts).
- Impede ataque de "trocar parâmetro pra reconhecer archived de
  outro user" — inclusive porque action não recebe `userId` como
  input (deriva da sessão).
- SC-003 verificável manualmente com 2 contas no quickstart.

**Alternatives considered**:
- **Action recebe `userId` como input**: rejeitado — abre porta pra
  forjar ID; sempre derivar da sessão é mais seguro.
- **Filtro só em `archived = 1`**: rejeitado — cross-user leak crítico.

---

## Decisão 5 — Feedback durante execução

**Decision**: usar `useTransition` no client. Botão fica `disabled`
com label "Reconhecendo…" enquanto `isPending`. Após sucesso, action
retorna e Next revalida automaticamente (botão e seção somem
porque `archivedPending.length` vai a 0 e condição de render falha).

**Rationale**:
- Pattern padrão do projeto — mesmo usado em
  [src/components/edit-set-modal.tsx](../../src/components/edit-set-modal.tsx)
  e demais Server Actions com feedback visual.
- Previne double-click (FR-009).
- Não exige toast/notification system extra (não há hoje no projeto).

**Alternatives considered**:
- **Spinner overlay fullscreen**: rejeitado — overkill para action
  ≤50ms típica.
- **Toast de sucesso**: rejeitado — desaparecimento visual da seção
  inteira já é feedback suficiente (resposta visual implícita).

---

## Decisão 6 — Tratamento de erro

**Decision**: action retorna `{ ok: true, count: N }` ou
`{ ok: false, error: string }` (mesmo shape de `updateSet` em
Inc 015). No client, falha exibe `setError("Falha ao reconhecer —
tente novamente.")` em texto inline próximo ao botão.

**Rationale**:
- Shape consistente com convenção do projeto (Server Actions com
  retorno tipado em vez de throw).
- Erro inline (não toast) por ser pontual e contextual.
- Mensagem genérica é aceitável: erro real é raro (DB indisponível);
  detalhar não ajudaria DJ.

**Alternatives considered**:
- **Throw**: rejeitado — pattern do projeto evita; React 19 error
  boundary fica inconsistente entre ações.
- **Modal de erro**: rejeitado — overkill; texto inline basta.

---

## Decisão 7 — Posicionamento do botão no header da seção

**Decision**: botão renderizado próximo ao contador "N pendentes" no
header existente da seção "Discos arquivados" em
[src/app/status/page.tsx](../../src/app/status/page.tsx). Layout
flex com label do contador à esquerda e botão à direita; em mobile
quebra para nova linha se necessário (já é o pattern responsivo
da página).

**Rationale**:
- Coerência visual: ação está "dentro" do contexto da seção que
  ela afeta.
- Sem novo container/card, menos clutter.
- Mobile: layout flex-wrap nativo do Tailwind cobre quebra automática
  para tap target preservado em 44×44.

**Alternatives considered**:
- **Botão flutuante (FAB)**: rejeitado — anti-pattern para o estilo
  editorial do projeto.
- **Botão acima do banner global**: rejeitado — banner é cross-route;
  ação é específica de `/status`.

---

## Resumo

Todas as decisões resolvidas — sem NEEDS CLARIFICATION pendentes.
Phase 1 procede com:
- 1 contrato em `contracts/server-actions.md`
- 1 quickstart com cenários incluindo mobile
- Sem `data-model.md` (zero schema delta)
