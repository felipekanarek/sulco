# Research — Inc 21: Prateleira como select picker

**Feature**: 020-shelf-picker-autoadd
**Date**: 2026-04-29

Decisões de design tomadas antes de Phase 1.

---

## Decisão 1 — Casing preservado, sem normalização automática

**Decision**: o picker NÃO normaliza pra UPPERCASE no submit. Apenas
aplica `trim()` no termo digitado antes de persistir. Filtragem da
busca é case-insensitive (substring). Match exato pra suprimir
"+ Adicionar" é case-sensitive.

**Rationale**:
- Forçar UPPERCASE seria opinionated e quebra DJs que usam
  convenções pessoais (ex: "discos-novos" em minúsculo
  intencionalmente).
- Se Felipe tem "E1-P2" e "e1-p2" no DB hoje (variações), a
  filtragem case-insensitive da busca já mostra ambos
  visualmente — DJ escolhe a "canônica" e a inconsistência se
  resolve por uso, não por imposição.
- Backfill de migração one-shot é trabalho extra (script +
  decisão de qual variante vence) que não compensa pra um
  problema raro.
- Spec Q1 (capitalização) marcada como decisão consciente em
  Assumptions; pode ser revisitada via Inc futuro se virar dor.

**Alternatives considered**:
- **UPPERCASE forçado no submit**: rejeitado — opinionated;
  DJ que tinha "Stash A" vê virar "STASH A".
- **Normalizar variações existentes via migration**: rejeitado
  — trabalho extra com baixo retorno; resolve por uso.
- **Title case automático**: rejeitado — pior que UPPERCASE
  porque depende de tokenização.

---

## Decisão 2 — Ordem alfabética case-insensitive (não LRU)

**Decision**: lista ordenada por `lower(shelfLocation)` ASC.

**Rationale**:
- Previsibilidade: DJ sabe onde "E1-P2" cai na lista.
- LRU (uso recente) seria mais rápido pra reuso comum, mas
  introduz comportamento "magia" — DJ pode estranhar a ordem
  mudando.
- Alfabética case-insensitive cobre o caso de ter "e1-p2" e
  "E1-P2" próximos visualmente (Decisão 1 mitiga inconsistência
  via vizinhança visual).
- Felipe tem ~30 prateleiras; alfabética não escala mal.

**Alternatives considered**:
- **LRU (uso recente)**: rejeitado por ora — pode ser Inc futuro
  se Felipe pedir.
- **Ordem por contagem de uso (pop)**: rejeitado — depende de
  COUNT no SQL e tem viés contra prateleiras novas.

---

## Decisão 3 — Reuso de `<MobileDrawer side="bottom">` em mobile

**Decision**: `<ShelfPicker>` em mobile renderiza dentro de
[`<MobileDrawer side="bottom">`](../../src/components/mobile-drawer.tsx)
existente (Inc 009). Em desktop usa popover absoluto custom
(divisão via Tailwind `md:` breakpoint).

**Rationale**:
- `<MobileDrawer>` já cobre: portal pra escapar de containing
  blocks, ESC pra fechar, body scroll lock, foco salvo/restaurado,
  animação slide-in. Princípio V cumprido sem retrofit.
- Bottom sheet com `max-h-[80vh]` + `rounded-t-lg` +
  `pb-[env(safe-area-inset-bottom)]` (já no `<MobileDrawer>`)
  é a UX nativa pra picker em iOS/Android.
- Em desktop o overhead do drawer é desnecessário; popover
  simples (absolute + ESC + click-out) basta. Constituição
  proíbe shadcn — implementação manual é OK.
- Detecção de breakpoint via Tailwind `md:` (CSS-only, sem
  detecção JS). Componente renderiza ambas as variantes; CSS
  esconde a inadequada.

**Alternatives considered**:
- **Mesmo popover absoluto em mobile**: rejeitado — viola
  Princípio V (modal não-fullscreen em telas pequenas).
- **Reusar `<FilterBottomSheet>` diretamente**: rejeitado —
  componente é específico pra filtros multi-select; copiar
  acopla evolução de duas features.
- **Detecção de viewport via `useMediaQuery` JS**: rejeitado —
  hidratação inicial estranha; Tailwind responsive cobre.

---

## Decisão 4 — Save-on-click (não save-on-blur)

**Decision**: persistir `shelfLocation` imediatamente quando o
DJ **clica** num item da lista (existente, "+ Adicionar" novo, ou
"— Sem prateleira —"). Não salvar ao "Enter" no input vazio nem
ao fechar o picker.

**Rationale**:
- Modelo mental claro: "clique no item = comprometer escolha".
  Nada implícito.
- Evita salvar acidentalmente quando DJ apenas explorou e fechou
  sem decidir.
- Diferente do `<input>` atual em `<RecordControls>` que faz
  save-on-blur (linha 96): novo modelo é mais explícito porque
  agora há uma lista intermediária.
- Permite "tentativa": DJ digita, vê filtragem, fecha sem
  salvar.

**Alternatives considered**:
- **Save-on-blur**: rejeitado — ambíguo no contexto de picker;
  perderia a opção "fechar sem salvar".
- **Botão Salvar explícito**: rejeitado — clique no item já é
  ação afirmativa; adicionar Salvar é redundante.

---

## Decisão 5 — Optimistic UI vs revalidação simples

**Decision**: usar otimismo simples — atualizar o trigger button
imediatamente ao clicar (estado `optimistic`), disparar Server
Action via `useTransition`, e em sucesso o RSC revalida e os
props chegam novos. Em erro, rollback do `optimistic` + mensagem
inline (mesma UX do `<RecordStatusActions>` Inc 19).

**Rationale**:
- Consistência cross-feature com Inc 19 (mesma UX pattern).
- Útil porque o picker fecha imediato após click — DJ não fica
  esperando ver "Salvando…".
- Lista de prateleiras é re-derivada do RSC após
  `revalidatePath` da action existente (cobre "+ Adicionar"
  aparecendo em outro disco — SC-004).

**Alternatives considered**:
- **Bloquear UI até confirmação**: rejeitado — UX pesado pra
  ação de 1 click.
- **`useOptimistic` (React 19)**: rejeitado — exige Form action;
  pattern atual com `useTransition` direto é simples e
  consistente com features anteriores.

---

## Decisão 6 — ARIA combobox

**Decision**: trigger é `<button>` com `aria-haspopup="listbox"`
e `aria-expanded`; lista é `<ul role="listbox">` com `<li
role="option">` para cada item; input de busca é `<input
type="search" role="combobox" aria-controls="<listbox-id>"
aria-activedescendant="<active-option-id>">`. Setas ↑/↓ movem
foco lógico; Enter seleciona; ESC fecha (já garantido pelo
`<MobileDrawer>` em mobile).

**Rationale**:
- Padrão WAI-ARIA combobox pattern (1.2 spec).
- `aria-activedescendant` em vez de mover foco DOM real — mais
  performático e funciona com listbox virtual.
- Cumpre FR-013.
- Pattern Linear/Notion/GitHub que Felipe mencionou.

**Alternatives considered**:
- **Dispatch focus DOM real para cada `<li>`**: rejeitado —
  reflow + reposicionamento de scroll a cada navegação por
  teclado.
- **`<select>` nativo**: rejeitado — sem suporte a "+ Adicionar"
  nem busca incremental.

---

## Decisão 7 — `<input type="search">` semântico

**Decision**: input de busca usa `type="search"` (mostra X
nativo pra limpar + cancela default browser do `Enter` em
forms).

**Rationale**:
- Semântica acessível.
- Browser oferece UI de "X clear" gratuito em desktop.
- `Enter` não submete form (desejado: queremos `Enter` =
  selecionar item ativo, não submit).

**Alternatives considered**:
- **`type="text"`**: rejeitado — perde semântica + perde X
  nativo.

---

## Decisão 8 — Empty state acolhedor

**Decision**: quando o DJ ainda não tem nenhuma prateleira
cadastrada (lista vazia), o picker abre apenas com "— Sem
prateleira —" no topo + texto auxiliar "Você ainda não tem
prateleiras. Digite o nome da primeira." Quando DJ digita algo,
"+ Adicionar 'X'" aparece.

**Rationale**:
- Edge case mencionado na spec.
- Vazio "puro" sem instrução é confuso — DJ não sabe que pode
  digitar pra criar.
- Texto auxiliar some assim que DJ começa a digitar (filtragem
  ativa).

**Alternatives considered**:
- **Lista totalmente vazia (sem texto)**: rejeitado — UX confuso.
- **Banner explicativo permanente**: rejeitado — clutter.

---

## Decisão 9 — Largura do picker / popover

**Decision**:
- **Mobile**: bottom sheet ocupa width 100% (já é o pattern
  `<MobileDrawer>`).
- **Desktop**: popover com largura igual ao trigger button
  (provavelmente ~280px) + `max-w-[400px]`. Lista pode
  scrolar verticalmente até `max-h-[300px]`.

**Rationale**:
- Largura consistente com o trigger evita layout shift.
- 300px de altura cabe ~10 itens com tap-target 32px desktop.

**Alternatives considered**:
- **Popover com largura fixa (ex: 320px)**: rejeitado — pode
  desalinhar do trigger se o card for menor.

---

## Resumo

9 decisões resolvidas — sem NEEDS CLARIFICATION pendentes. Phase
1 procede com:
- 1 contrato em `contracts/ui-contract.md` (especifica props,
  visual, ARIA, estado, comportamento de busca/filtro/criar).
- 1 quickstart com cenários cobrindo US1, US2, US3, mobile, a11y,
  multi-user, lista grande, lista vazia, race com revalidate.
- Sem `data-model.md` (zero schema delta).
