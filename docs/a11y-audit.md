# A11y Audit — Sulco Piloto

Checklist manual para verificar conformidade com **WCAG 2.1 AA** conforme
FR-047, FR-048, FR-049 e FR-049a. Não há gate automático em CI; esta
auditoria é parte do protocolo pré-ship.

**Ferramentas**: Chrome DevTools → aba **Accessibility** (tree) e **Lighthouse**
(mode: accessibility only).

## Telas críticas a auditar

Rodar Lighthouse a11y em cada uma e registrar score (meta ≥95):

- [ ] `/` listagem da coleção
- [ ] `/` com `view=grade`
- [ ] `/curadoria` triagem sequencial
- [ ] `/disco/[id]` curadoria de faixas
- [ ] `/sets` lista de sets
- [ ] `/sets/novo` form
- [ ] `/sets/[id]/montar` montagem
- [ ] `/sets/[id]` visão do set + bag
- [ ] `/status` painel de sync
- [ ] `/conta` perfil
- [ ] `/onboarding` pós-sign-up
- [ ] Banner de credencial inválida (forçar via SQL)
- [ ] Banner de disco arquivado (forçar via SQL)

## FR-047 — Contraste WCAG AA

Inspecionar cada **token CSS + combinação** no DevTools (aba Colors):

- [ ] `--ink` sobre `--paper` (texto normal) ≥ 4.5:1
- [ ] `--ink-soft` sobre `--paper` (texto normal) ≥ 4.5:1
- [ ] `--ink-mute` sobre `--paper` (texto grande 19px+) ≥ 3:1
- [ ] `--accent` sobre `--paper` (texto normal) ≥ 4.5:1
- [ ] `--ok` sobre `--paper` ≥ 4.5:1
- [ ] `--warn` sobre `--paper` ≥ 4.5:1
- [ ] Botão `bg-ink text-paper` ≥ 4.5:1 (fácil, contraste 20:1)
- [ ] Botão `bg-warn text-paper` — testar especificamente
- [ ] Badges `border-accent text-accent bg-accent/5` — o texto em accent
  sobre bg-accent-soft é o risco; verificar
- [ ] Chip picker active `bg-accent/10 border-accent` — texto ink sobre
  accent/10 deve dar ≥ 4.5:1

## FR-048 — Foco visível

Navegar com **Tab** em cada tela e garantir:

- [ ] Todo `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>` mostra
  outline visível no `:focus-visible`
- [ ] Handle de drag-and-drop (⋮⋮) recebe foco e mostra que é arrastável
- [ ] Links no rodapé de cada página também destacam no foco
- [ ] `SignInButton`/`SignUpButton` da Clerk estão bem visíveis

## FR-049 — ARIA em controles

Inspecionar no Accessibility tree do DevTools:

- [ ] `<BombaToggle>` tem `role="switch"` + `aria-checked`
- [ ] `<BombaFilter>` tem `role="switch"` + `aria-label` descritivo
- [ ] Filter status chips têm `aria-pressed`
- [ ] Toggle on/off de `selected` de track tem `aria-pressed` + `aria-label`
- [ ] `<CamelotWheel>` buttons têm `aria-pressed`
- [ ] `<ChipPicker>` chips com × têm `aria-label="Remover X"`
- [ ] `<SortableSetList>` container tem `role="listbox"` + `aria-label`
- [ ] Itens do sortable list têm `role="option"` + `aria-posinset` + `aria-setsize`
- [ ] Progressbar de import tem `role="progressbar"` + `aria-valuenow`/min/max
- [ ] Banners têm `role="alert"` (erro) ou `role="status"` (info)
- [ ] Formulários com erro têm `aria-describedby` apontando para mensagem
- [ ] Inputs tem `<label>` associado ou `aria-label`

## FR-049a — Método de verificação

Este arquivo É o método. Cada item acima foi checado e:

- [ ] Todos marcados ✅ → a11y OK para ship
- [ ] Qualquer falha → registrar em issue + fix antes de ship

## Registro de auditoria

Data da última auditoria completa: **PENDENTE** (preencher ao fechar checklist)
Executante: **___**
Resultado: **___**

## Automação futura

Fora do escopo do piloto, mas possível:
- axe-core via Playwright em `@axe-core/playwright`
- Lighthouse CI em `.github/workflows/ci.yml`

Hoje é tudo manual.
