# Contratos — Componentes UI

Inc 009 não tem APIs externas nem Server Actions novas. Os contratos
são apenas das interfaces dos client components novos.

---

## `<MobileDrawer />`

Primitiva genérica. Cliente em `src/components/mobile-drawer.tsx`.

```tsx
type MobileDrawerProps = {
  /** Controla abertura. */
  open: boolean;
  /** Disparado por: tap no overlay, ESC, botão X interno. */
  onClose: () => void;
  /** Lado de origem do slide. */
  side: 'left' | 'right' | 'bottom';
  /** Aria label do dialog (acessibilidade). */
  ariaLabel: string;
  /** Conteúdo do drawer. */
  children: React.ReactNode;
  /** Largura/altura customizada (default: 75% lateral, 80vh bottom). */
  className?: string;
};

export function MobileDrawer(props: MobileDrawerProps): JSX.Element;
```

**Comportamento**:
- Renderiza overlay escurecido + painel deslizante.
- Body scroll lock quando `open === true`.
- ESC global fecha.
- Tap no overlay fecha.
- Foco salvo ao abrir, restaurado ao fechar.
- Trap de foco dentro do drawer enquanto aberto.
- `role="dialog" aria-modal="true"`.

**Não faz**:
- Drag-to-close gestos (MVP).
- Snap points intermediários (MVP).
- Animação spring/momentum (apenas CSS transition simples).

---

## `<MobileNav />`

Drawer da navegação principal. Cliente em `src/components/mobile-nav.tsx`.

```tsx
type MobileNavProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileNav(props: MobileNavProps): JSX.Element;
```

**Conteúdo do drawer**:
- Botão "X" no canto superior direito (≥44×44px).
- Nav vertical empilhada:
  - "Coleção" → `/`
  - "Sets" → `/sets`
  - "Sync" → `/status`
  - "Conta" → `/conta`
- (Owner only): "Admin" → `/admin/convites`
- Tap em qualquer link navega + fecha drawer.

**Estilo**: Tap targets ≥48px altura. Tipografia `font-mono uppercase
tracking-wide` igual aos NavLinks atuais. Border bottom em cada item.

**Composição**: usa `<MobileDrawer side="left" ariaLabel="Menu de navegação">`.

---

## `<MobileNavTrigger />`

Botão hambúrguer. Cliente em `src/components/mobile-nav.tsx` (mesmo
arquivo do `<MobileNav>`).

```tsx
type MobileNavTriggerProps = {
  className?: string;
};

export function MobileNavTrigger(props: MobileNavTriggerProps): JSX.Element;
```

**Comportamento**:
- Renderiza ícone hambúrguer (3 linhas SVG ou `☰` texto).
- Estado `useState<boolean>` controla `<MobileNav>` correspondente.
- Tap abre o drawer.
- ≥44×44px área de toque.

**Layout**: `<MobileNavTrigger>` é renderizado pelo Header em
`src/app/layout.tsx` (junto ao SyncBadge); `<MobileNav>` é renderizado
adjacente, controlado por estado interno.

**Alternativa**: usar Context global pra abrir programaticamente
(rejeitado pra MVP — desnecessário).

---

## `<FilterBottomSheet />`

Bottom sheet pros filtros multi-facet. Cliente em
`src/components/filter-bottom-sheet.tsx`.

```tsx
type FilterBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Conteúdo dos filtros (passa o JSX dos filtros existentes). */
  children: React.ReactNode;
  /** Contagem de filtros ativos pra exibir no título. */
  activeFilterCount: number;
  /** Disparado quando user clica "Aplicar". */
  onApply: () => void;
};

export function FilterBottomSheet(props: FilterBottomSheetProps): JSX.Element;
```

**Conteúdo do sheet**:
- Topo: handle visual (linha curta cinza), título "Filtros (N)",
  botão "X" (≥44×44px).
- Meio: `children` em scroll container interno (overflow-y auto;
  altura calculada).
- Rodapé: botão "Aplicar (N)" sticky, full-width, alto contraste.

**Comportamento**:
- max-height: 80vh.
- topo arredondado (`rounded-t-lg`).
- "Aplicar" chama `onApply()` (parent decide o que isso significa
  — geralmente promove draft pra URL searchParams).
- "X" e tap no overlay chamam `onClose()` (descarta draft).

**Composição**: usa `<MobileDrawer side="bottom" ariaLabel="Filtros">`.

---

## `<FilterActiveChips />`

Chip-bar compacto exibindo filtros aplicados acima da lista (após
fechar o sheet com filtros aplicados). Cliente em
`src/components/filter-active-chips.tsx`.

```tsx
type ActiveFilter = {
  /** Identificador único pra remoção. */
  id: string;
  /** Texto exibido (ex: "BPM 110-130", "mood: solar"). */
  label: string;
  /** Disparado ao clicar X. */
  onRemove: () => void;
};

type FilterActiveChipsProps = {
  filters: ActiveFilter[];
};

export function FilterActiveChips(props: FilterActiveChipsProps): JSX.Element | null;
```

**Comportamento**:
- Se `filters.length === 0`, retorna `null`.
- Renderiza chips horizontais scrolláveis (overflow-x auto) com X em
  cada.
- Tap no X chama `onRemove()` do filtro específico → parent atualiza
  estado e re-busca.

**Exibido em**: home `/` mobile (filtros de gênero/estilo) e
`/sets/[id]/montar` mobile (todos os filtros).

---

## Refactor de componentes existentes (sem nova interface, ajustes de classes)

### `<TrackCurationRow>` — `src/components/track-curation-row.tsx`

**Mudança**: grid e layout reorganizam por breakpoint. Sem props
novas.

Mobile: bloco vertical empilhado com tap targets ≥44px.
Desktop: layout atual preservado.

### `<CandidateRow>` — `src/components/candidate-row.tsx`

**Mudança**: idem. Em mobile vira flex-col stack com 5-6 rows.
Em desktop mantém grid `[48px_auto_56px_1fr_auto_auto]`.

### `<MontarFilters>` — `src/components/montar-filters.tsx`

**Mudança**: em mobile, em vez de renderizar inline na sidebar, é
embrulhado pelo parent dentro de `<FilterBottomSheet>`. Em desktop
continua sidebar inline.

Implementação: o componente de filtros em si não muda (apenas seu
container). Parent (`/sets/[id]/montar/page.tsx`) decide
condicionalmente o wrapper.

### `<FilterBar>` (home) — `src/components/filter-bar.tsx`

**Mudança**: idem `<MontarFilters>` — wrapper condicional.

### `<RecordGridCard>` — `src/components/record-grid-card.tsx`

**Mudança**: tamanho responsivo. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
no parent (home page).

### `Header` (em `src/app/layout.tsx`)

**Mudança**: layout responsivo. Em mobile esconde `<nav>`, mostra
`<MobileNavTrigger>`; em desktop layout atual preservado.

---

## Acessibilidade (cross-cutting)

- Todo drawer/sheet tem `role="dialog" aria-modal="true"` + `ariaLabel`.
- ESC fecha drawer/sheet.
- Tap targets primários ≥44×44px (FR-004).
- Foco gerenciado: salva ao abrir, trap interno, restaura ao fechar.
- Inputs numéricos: `inputMode="numeric"` ou `type="tel"` (FR-006).

---

## Não-contratos

Os seguintes NÃO são introduzidos em 009:

- **Service worker** (PWA — Inc 2b futuro).
- **Manifest.json** (idem).
- **Push notifications**.
- **Background sync**.
- **Gestos** (swipe, pull-to-refresh, drag-to-close).
- **Offline mode**.
- **Modo escuro/dark mode**.
