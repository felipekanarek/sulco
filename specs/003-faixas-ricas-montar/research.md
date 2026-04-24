# Research: Faixas ricas na tela "Montar set" (003)

## Contexto

A feature é puramente UI — sem novos componentes de arquitetura,
sem schema, sem deps, sem endpoints. A research abaixo endereça
decisões práticas de implementação que o plan precisa cristalizar
pra o /speckit.tasks sair útil.

## R1 — Refatoração in-place vs novo componente

**Decision**: refatorar `src/components/candidate-row.tsx` in-place,
mantendo o nome do arquivo e a export signature `CandidateRow`.
Internamente, extrair um sub-componente client `<ExpandToggle>` que
cuida só do estado `expanded` e do botão chevron.

**Rationale**:

- Arquivo já é `'use client'` por causa do `addTrackToSet` handler +
  `useState` do cover fallback. Refatoração in-place mantém a
  fronteira atual de "tudo cliente" sem introduzir separação
  Server/Client profunda só pra ganhar micro-segurança.
- Next 15 permite ter sub-componentes Server dentro de Client apenas
  se forem passados como `children` — muito trabalho pra ganho
  marginal aqui (o candidato todo renderiza a partir de props que
  já vêm do servidor).
- Nome `candidate-row.tsx` mantém chamadas em `montar/page.tsx`
  intactas; zero refactor viral.

**Alternatives considered**:

- Criar `candidate-card.tsx` novo, depreca o row: introduz migração
  desnecessária e pode confundir histórico git.
- Server Component puro com `<Details><Summary>`: resolveria o
  toggle via HTML nativo SEM JS, mas perderíamos uniformidade de
  estilo com o resto do sistema; `<Details>` é notoriamente chato de
  estilizar consistentemente entre navegadores.

## R2 — Chips moods vs contexts: tokens visuais

**Decision**: criar um componente `<Chip>` reusável em
`src/components/chip.tsx` com duas variants:

- `variant="mood"` — fundo `bg-accent-soft`, texto `ink`, borda
  `accent/40`
- `variant="context"` — fundo transparente, texto `ink-soft`, borda
  `line` (ou `ink-mute`)

Reutiliza no `chip-picker` existente se houver convergência,
mas não força refactor dele agora.

**Rationale**:

- Moods = estado/sensação (solar, festivo, melancólico) → ganham
  mais peso visual (fundo preenchido, accent vermelho)
- Contexts = função no set (pico, aquecimento, fechamento) →
  mais estruturais, ganham visual "etiqueta" sóbria
- Paleta reusa tokens já presentes no globals.css (`--accent-soft`,
  `--ink-soft`, `--line`); nenhuma cor nova.

**Alternatives considered**:

- Prefixo textual (`🎭 solar`, `🕐 pico`): tonal inconsistente com o
  estilo editorial do piloto, emoji quebra a tipografia.
- Duas cores do tema (moods em verde, contexts em azul): introduz
  cor nova, ruído contra o "único acento vermelho" do editorial.

## R3 — Chip overflow `+N mais` no modo compacto

**Decision**: limit = 4 chips visíveis por grupo (moods E contexts
são truncados independentemente). 5º slot vira um `+N mais` em
estilo `ghost` (sem fundo, só texto com borda tracejada ou
sublinhado). Clicar em `+N mais` expande o card inteiro (não só o
grupo de chips) — simplifica modelo mental.

**Rationale**:

- Altura previsível do card compacto = 1 linha de chips (até 4).
- Comportamento do `+N mais` não duplica o toggle do chevron; só
  oferece atalho quando o chip "explica" a necessidade.
- Segue precedente do `filter-bar` do piloto que usa `+N` pra
  facetas.

**Alternatives considered**:

- Permitir wrap livre: altura varia imprevisivelmente, quebra scan.
- Truncar em 2 ou 3: muito restritivo, esconde signal.
- Truncar só a lista combinada (moods + contexts juntos): perde a
  separação visual por tipo.

## R4 — Rating literal `+/++/+++`

**Decision**: manter o componente existente `<RatingGlyph>`
refatorando o comportamento pra obedecer FR-004:
- `rating=1` → `+` em cor `text-ink-mute` (cinza neutro)
- `rating=2` → `++` em cor `text-ink` (preto neutro)
- `rating=3` → `+++` em cor `text-accent` com `font-semibold` (bold
  vermelho)
- `rating=null` → omissão total (sem placeholder)

**Rationale**:

- Já é symbol literal na UI, fácil refactor.
- Escalar cor crescente guia o olho pro "melhor": cinza < preto <
  vermelho bold.
- Gradiente visual casa com a semântica "boa, mas nem tanto" → "boa"
  → "muito boa pra tocar".

**Alternatives considered**:

- Usar estrelas (★★★/★★/★): abandona convenção atual da UI de `+`,
  e força mudança no `/disco/[id]`.
- Gradient contínuo de opacity: menos legível que cor definida.

## R5 — Botão "remover da bag" inline no card

**Decision**: quando um card está marcado como "já na bag"
(`alreadyIn={true}`), substituir o botão `+` por um par de botões:

- `✓` grande (não-clicável, confirma visualmente)
- `×` pequeno à direita (clicável, chama `removeTrackFromSet`)

Alternativamente: botão único que toggla entre + e ×, dependendo
do estado `inSet`. Preferência pela alternativa pela simplicidade.

**Rationale**:

- Mantém pressionado o loop "add → remove → add" sem precisar
  sair do candidato.
- `removeTrackFromSet` já existe em `src/lib/actions.ts` (piloto
  001); integração trivial.
- Evita que o DJ tenha que ir até o `SetSidePanel` pra desfazer.

**Alternatives considered**:

- Não oferecer remove inline: força ir no SetSidePanel — fluxo pior.
- Menu de contexto (click-direito): viola convenção web, não
  descobrível.

## R6 — Persistência do estado `expanded`

**Decision**: `useState` local no componente client. Estado vive
apenas na memória do component tree; reset no reload.

**Rationale**:

- Spec explícita (FR-008): estado não persiste entre sessões.
- Zero impacto em DB, cookies, localStorage.
- Simplifica código e testes.

**Alternatives considered**:

- `localStorage` por trackId: persiste além da sessão — pode
  virar bagunça em listas diferentes de sets.
- `cookie`/DB: overhead injustificável pra estado transiente de UI.

## R7 — Acessibilidade do toggle

**Decision**: botão com:
- `aria-expanded={boolean}`
- `aria-controls={id da região expandida}`
- Texto acessível via `aria-label` ("Expandir detalhes da faixa
  X de Y" / "Recolher detalhes...")
- Suporte a teclado: Enter e Space ativam (default de `<button>`)

**Rationale**:

- Padrão WAI-ARIA para disclosure widgets.
- Sem libs externas; HTML semântico + aria suficiente.

**Alternatives considered**:

- `<details><summary>` nativo: abandonado em R1 pela dificuldade
  de estilização consistente.
- Sem ARIA: viola o compromisso de a11y do piloto (Lighthouse ≥95).

## R8 — Campos faltantes no query atual

**Decision**: expandir `src/lib/queries/montar.ts::queryCandidates`
pra incluir:
- `tracks.references` (novo no SELECT + no tipo Candidate)
- `records.notes` (novo no SELECT + no tipo Candidate)

Campos já presentes: `fineGenre`, `comment`, `shelfLocation`, `rating`,
`isBomb`, `moods`, `contexts`.

**Rationale**:

- 2 colunas adicionais × ~100-500 linhas = poucos bytes extras; sem
  impacto perceptível de performance.
- Mantém query única — nenhuma N+1.

**Alternatives considered**:

- Lazy-load de `references`/`notes` só quando `expanded=true` via
  Server Action: adiciona latência no toggle (~100-300ms) que viola
  FR-009 ("instantâneo, sem fetch"). Descartado.

## Conclusão

Zero `NEEDS CLARIFICATION` emergiu. Plan está livre pra Phase 1.
Design respeita Constitution (Princípio I intocado, Server-First
quando aplicável, Schema como fonte da verdade) e não introduz
dependências novas.
