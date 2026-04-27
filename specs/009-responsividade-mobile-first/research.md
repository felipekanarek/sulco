# Phase 0 — Research: Responsividade mobile-first (009)

**Data**: 2026-04-26
**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Decisões fundamentadas pra eliminar incertezas técnicas antes do design.

---

## 1. Estratégia de breakpoints e mobile-first

**Decisão**: Tailwind v3 com breakpoints **default** (sem custom no
config), mobile-first nas classes:

| Breakpoint | min-width | Uso |
|---|---|---|
| (default) | 0px | mobile portrait (360-480px) |
| `sm:` | 640px | mobile landscape / tablet pequeno |
| `md:` | 768px | tablet portrait |
| `lg:` | 1024px | desktop pequeno |
| `xl:` | 1280px | desktop padrão |

**Convenção do incremento**: classes default = mobile; `md:`+ adicionam
desktop. Ex: `flex-col md:flex-row`, `text-base md:text-lg`,
`p-4 md:p-8`. Layouts de desktop atuais (que hoje usam ex.
`grid-cols-[380px_1fr]`) viram `flex-col gap-6 md:grid md:grid-cols-[380px_1fr] md:gap-16`.

**Rationale**:
- Tailwind já está no projeto (constituição), zero custo de adoção.
- Breakpoints default cobrem 99% dos casos sem custom config.
- Mobile-first é a convenção da própria Tailwind v3 (default = base,
  prefixos = override pra cima).
- Não muda o `tailwind.config.ts` atual — operação aditiva.

**Alternativas**:
- *Custom breakpoints* (ex: `xs: 480px`): rejeitado — overhead sem ganho
  claro; defaults bastam.
- *CSS modules / @media manual*: rejeitado — fora da estética Tailwind
  do projeto.

---

## 2. Drawer lateral (`<MobileNav>` — FR-007/007a)

**Decisão**: Client component `<MobileDrawer>` genérico parametrizado
por `side: 'left' | 'right' | 'bottom'`, instanciado como
`<MobileNav side="left">` para nav e como `<FilterBottomSheet>` (que
internamente usa `<MobileDrawer side="bottom">`) para filtros.

**Implementação principal**:
```tsx
<div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
  {/* overlay */}
  <div
    className={`absolute inset-0 bg-ink/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
    onClick={onClose}
    aria-hidden
  />
  {/* panel */}
  <div
    className={`absolute ${sideClasses} bg-paper transition-transform ${transformClasses}`}
    role="dialog"
    aria-modal="true"
  >
    {children}
  </div>
</div>
```

`sideClasses` por side:
- `left`: `top-0 left-0 h-full w-[75%] max-w-[320px]`
- `right`: `top-0 right-0 h-full w-[75%] max-w-[320px]`
- `bottom`: `bottom-0 left-0 right-0 max-h-[80vh] rounded-t-lg`

`transformClasses` aberto/fechado com `translateX` (lateral) ou
`translateY` (bottom).

**Body scroll lock**: ao abrir, salvar `document.body.style.overflow`
e setar `'hidden'`. Restaurar no close. Usar `useEffect` com
cleanup. Validar em iOS Safari (notório por bugs com scroll lock —
solução comum: `position: fixed` no body com `top: -scrollY`; mas
`overflow: hidden` cobre 95% dos casos).

**Foco e teclado**:
- Trap de foco dentro do drawer enquanto aberto (loop entre
  primeiro/último elemento focável).
- ESC fecha o drawer (event listener no `useEffect`).
- Foco volta pro trigger ao fechar (salvar `document.activeElement`
  antes de abrir).

**Rationale**:
- Padrão consagrado (Material, Notion, Linear); usuário entende
  imediatamente.
- Constituição proíbe libs de UI — implementação manual é viável e
  curta (~80-120 LOC do `<MobileDrawer>`).
- Aria + scroll lock + ESC + focus trap garantem acessibilidade
  básica obrigatória.

**Alternativas**:
- *Bottom tab bar* (rejeitado em /speckit-clarify Q1): consome real
  estate vertical permanente; padrão "app nativo" não combina com a
  estética editorial sóbria do Sulco.
- *Top bar inline scrollável* (rejeitado): chips horizontais ficam
  apertados com 4 itens + UserButton + SyncBadge; usabilidade ruim.
- *react-aria-components ou Headless UI*: rejeitado — constituição.

---

## 3. Bottom sheet pra filtros (`<FilterBottomSheet>` — FR-008/008a)

**Decisão**: Reuso de `<MobileDrawer side="bottom">` com overlay
escurecido, max-height 80vh, topo arredondado, drag handle visível, e
botão "Aplicar" sticky no rodapé.

**Estrutura do sheet**:
```
┌────────────────┐
│      ─         │  ← handle (visual, não interativo MVP)
│  Filtros (3)   │  ← título + contagem
│                │
│  [conteúdo]    │  ← scrollable
│   BPM range    │
│   Moods        │
│   ...          │
│                │
│  [Aplicar (3)] │  ← sticky bottom
└────────────────┘
```

**MVP**: drag handle é puramente visual (decorativo). Fechamento via
tap no overlay, botão "X" no canto superior direito ou botão
"Aplicar" no rodapé. Drag-to-close real (com momentum, gesture
detection) fica como evolução futura — esforço alto, ROI baixo no
MVP.

**Estado dos filtros**: persiste entre aberturas via `useState` no
componente parent (a página que usa o sheet). Quando user fecha sem
"Aplicar", mudanças locais são descartadas; quando fecha via
"Aplicar", parent recebe os novos filtros e re-busca.

**Conteúdo reutilizado**: o JSX de filtros (sliders BPM, ChipPicker
de moods/contexts, etc.) já existe em `<MontarFilters>` — apenas
re-empacotar em mobile dentro do `<FilterBottomSheet>`. Em desktop
continua inline.

**Rationale**:
- Q3 do clarify: bottom sheet escolhido (vs drawer lateral / modal
  full-screen).
- Polegar-friendly (alcance natural com 1 mão).
- Não compete com drawer da nav (esquerda).

**Alternativas**:
- *Drag-to-close real*: rejeitado pra MVP — exige library de gesture
  ou implementação custom (~200 LOC + edge cases).
- *Snap points (collapsed/expanded)*: rejeitado — overkill.

---

## 4. Header colapsável (FR-007 — `layout.tsx`)

**Decisão**: Header detecta viewport via Tailwind `md:` prefix.
- **Mobile (default)**: logo "Sulco." à esquerda + ícone hambúrguer à
  direita. Nav links escondidos. SyncBadge ao lado do hambúrguer.
- **Desktop (`md:`)**: layout atual preservado (logo + nav inline +
  user/sync à direita).

**Implementação**: condicional via classes responsivas, sem JS:
```tsx
<header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
  <div className="px-4 py-3 md:px-8 md:py-6 grid grid-cols-[auto_1fr_auto] items-baseline gap-4 md:gap-12 max-w-[1240px] mx-auto">
    <Logo />
    <nav className="hidden md:flex justify-center gap-10">
      {/* nav links — só desktop */}
    </nav>
    <div className="flex items-center gap-3">
      <SyncBadge />
      <Show when="signed-in">
        {/* hambúrguer só mobile */}
        <MobileNavTrigger className="md:hidden" />
        {/* nav user só desktop */}
        <Link href="/conta" className="hidden md:inline">Conta</Link>
        <UserButton />
      </Show>
      {/* signed-out: igual atual */}
    </div>
  </div>
</header>
```

**`<MobileNav>`** é montado uma vez no layout.tsx, controlado por
estado em `<MobileNavTrigger>` (client component). Estado pode ser
local OU via Context se outras telas precisarem abrir programaticamente
(provavelmente não no MVP).

---

## 5. Touch targets (FR-004)

**Decisão**: tap target mínimo de **44×44px** (Apple HIG, padrão WCAG
AAA). Aplicado a:

- Toggle on/off de faixa (atual `text-[11px] px-3 py-2` ≈ 32×28px) →
  crescer pra `text-[13px] px-4 py-3 min-h-[44px] min-w-[44px]`.
- Rating (+, ++, +++) — atual `min-w-[40px] py-1` → `min-h-[44px]`.
- Bomba toggle compact — auditar.
- PreviewControls (008) — botões `text-[11px] px-3 py-1.5` ≈ 32×26px →
  crescer pra `min-h-[44px]`.
- Botão hamburger novo — `min-w-[44px] min-h-[44px]` from start.
- Drawer close button — `min-w-[44px] min-h-[44px]`.
- Cards de coleção (link Discogs, etc.) — auditar tap zones.

**Estratégia**: usar utility class `min-h-[44px]` (Tailwind arbitrary
value) ou padding generoso + line-height alta. Manter texto pequeno
do tipo `text-[10px]` mas envolto em container com `min-h-[44px]`.

**Rationale**:
- 44px é o consenso da indústria; menor que isso causa miss-tap em
  ~5-15% dos cliques em mobile.
- Em desktop, tap targets podem ficar visualmente menores (aplicar
  `md:min-h-0`) se ofender a estética editorial — mas em mobile é
  obrigatório.

---

## 6. Card grid responsivo (FR-011)

**Decisão**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` como base
para `<RecordGridCard>` na home.

| Viewport | Colunas |
|---|---|
| <640px | 1 |
| 640-1023px | 2 |
| ≥1024px | 4 (atual desktop) |

**Filter bar (home)**: hoje é parede de chips. Em mobile, vira botão
"Filtros (N)" que abre `<FilterBottomSheet>` (igual `/sets/[id]/montar`).
Reuso direto.

**Search input**: mantém visível no topo da home em todos os
breakpoints. Em mobile, ocupa 100% da largura.

---

## 7. `/disco/[id]` mobile layout (FR-009 — banner full-width)

**Decisão**: empilhamento vertical em mobile:

```
┌──────────────────┐
│                  │
│   [BANNER CAPA]  │  ← full-width, ~aspect-square
│      ~390px      │     ou aspect-[16/9] cropped
│                  │
├──────────────────┤
│ Spoon            │  ← artist (label-tech)
│ Transference     │  ← title (italic, large)
│ ── ── ── ──      │
│ Ano · 2010       │
│ Selo · Merge     │
│ Status · ativo   │
│ ── ── ── ──      │
│ [editar status]  │
│ [reimport]       │
│ [→ Discogs]      │
├──────────────────┤
│ ── Lado A ──     │
│  A1 ▶ ⏵ Spotify │
│  A2 ▶ ⏵ Spotify │
│  ...             │
│ ── Lado B ──     │
│  ...             │
└──────────────────┘
```

Em desktop (`md:`), volta pro grid `[380px_1fr]` atual com sidebar
sticky.

**`<TrackCurationRow>` mobile**: refactor do grid `[36px_1fr_auto]`
pra:
- Mobile: `grid-cols-[28px_1fr]` com posição compacta + bloco
  vertical contendo título + preview + tags + toggle + rating +
  bomba empilhados.
- Desktop: mantém atual `[36px_1fr_auto]`.

**Editor expansível** (`<details>` com BPM/energy/moods/contexts/
comment): em mobile, ao expandir, ocupa largura total da row. Inputs
empilham em 1 coluna via `grid-cols-1 md:grid-cols-2`.

---

## 8. `<CandidateRow>` mobile layout (FR-010, US2)

**Decisão**: refator do grid atual `[48px_auto_56px_1fr_auto_auto]`
pra layout flex-col em mobile:

```
Mobile (<640px):
┌─────────────────────┐
│ [cover] A1 +++     │  ← row 1: cover + position + rating
│ Before Destruction │  ← row 2: título
│ Spoon · Transfer.. │  ← row 3: artist · record
│ 124 BPM · 8A · e3  │  ← row 4: badges essenciais
│ [▶ Deezer] [↗ Spo] │  ← row 5: preview controls
│            [+/✓]   │  ← row 6: action button
└─────────────────────┘

Desktop (md+): grid atual
```

Detalhes expandidos (notes, ref, full chips) ficam atrás do toggle
"▾ expandir" em mobile também.

---

## 9. Body scroll lock seguro (overlay aberto)

**Decisão**: usar técnica simples (`overflow: hidden` no body) com
fallback iOS opcional:

```tsx
useEffect(() => {
  if (!open) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { document.body.style.overflow = prev; };
}, [open]);
```

iOS Safari ≤17 tem bug onde `overflow: hidden` no body NÃO trava
scroll dentro de modais. Solução completa exige `position: fixed` +
salvar/restaurar scrollY:

```tsx
const scrollY = window.scrollY;
document.body.style.position = 'fixed';
document.body.style.top = `-${scrollY}px`;
// cleanup:
document.body.style.position = '';
document.body.style.top = '';
window.scrollTo(0, scrollY);
```

**MVP**: só `overflow: hidden`. Validar manualmente em iOS Safari
durante quickstart; aplicar fallback se observado problema.

---

## 10. Imagens responsivas (FR-013)

**Decisão**: usar `sizes` attribute do Next `<Image>`:

```tsx
<Image
  src={record.coverUrl}
  alt=""
  width={600}
  height={600}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
  unoptimized={false}
/>
```

Hoje várias imagens estão `unoptimized` por questões de fonte
externa Discogs. Pra Inc 009, tentar remover `unoptimized` em mobile
crítico (banner do `/disco/[id]`) e ver se Vercel aceita o domínio.
Se quebrar, manter `unoptimized` mas reduzir `width`/`height` pelo
contexto.

**Configuração Next**: pode requerer `next.config.ts` com
`remotePatterns` pra `i.discogs.com` ou similar — auditar.

---

## 11. Estratégia de teste

**Decisão**:
- **Component tests (Vitest + happy-dom)**: `<MobileDrawer>` e
  `<FilterBottomSheet>` — estado open/closed, body scroll lock, ESC
  fecha, tap no overlay fecha. Pattern do 008/T018a.
- **e2e mobile (Playwright)**: 1 spec cobrindo US1 fluxo
  completo em viewport `375x667`. Verifica:
  - sem scroll horizontal em rotas auditadas
  - tap em toggle on/off funciona
  - tap em ▶ Deezer toca preview
  - drawer da nav abre/fecha
  - filter bottom sheet (em /sets/[id]/montar) abre/fecha
- **Visual regression (manual)**: screenshots desktop antes/depois,
  comparação manual em ≥10 rotas.

**Sem unit tests específicos pra layout** — Tailwind é declarativo,
testes seriam frágeis. Confiar em e2e + visual diff.

---

## 12. Identidade editorial em mobile

**Decisão**: preservar 100% das primitivas tipográficas e de cor.
- `font-serif` (EB Garamond) para títulos e corpo
- `font-mono` (JetBrains Mono) para metadados
- Acento `#a4332a` ao mínimo
- Paper/ink/line do tema atual

Mudanças permitidas em mobile:
- Tamanhos de fonte podem reduzir 1-2 pontos (`text-[19px]` desktop
  → `text-[17px]` mobile) pra economizar real estate.
- Padding/margin reduzidos (`p-8` → `p-4`).
- Grids mais simples (1-2 colunas vs 4).

**Regra**: nada que mude a "vibe" do prototype baseline. Sempre
consultar `../sulco-legacy-backup/` quando dúvida (memória
`feedback_ui_prototype_baseline`).

---

## Unknowns resolvidos

✅ Estratégia de breakpoints (Tailwind defaults, mobile-first)
✅ Drawer lateral implementação (`<MobileDrawer>` + scroll lock)
✅ Bottom sheet implementação (max-height 80vh + sticky apply)
✅ Header colapsável (responsive classes, sem JS extra)
✅ Touch targets (min 44×44px universal)
✅ Card grid responsivo (1/2/4 colunas por breakpoint)
✅ `/disco/[id]` mobile layout (banner full-width)
✅ `<CandidateRow>` mobile layout (flex-col stack)
✅ Body scroll lock (overflow hidden + iOS fallback opcional)
✅ Imagens responsivas (`sizes` attribute do Next `<Image>`)
✅ Estratégia de teste (component tests + e2e mobile + visual diff)
✅ Identidade editorial preservada

Nenhum NEEDS CLARIFICATION remanescente.
