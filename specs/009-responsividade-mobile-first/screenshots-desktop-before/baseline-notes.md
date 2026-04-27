# Baseline Desktop (≥1024px) — pre-009

**Data**: 2026-04-27 (pré-implementação 009)
**Propósito**: Pontos visuais críticos pra validar zero regressão (SC-004) pós-implementação.

## Header

- Sticky top, altura ~80px (py-6 + content)
- Logo `Sulco.` à esquerda, font-serif italic ~26px, ponto vermelho accent
- Nav central: 3 NavLinks (Coleção / Sets / Sync) font-mono uppercase, gap-10
- Direita: SyncBadge + Conta link + UserButton com gap-3

## `/` (home — coleção)

- Grid de cards 4 colunas (`xl`+); 2 colunas em md; 1 em sm
- FilterBar como parede de chips inline (genres + styles + bomba toggle)
- Search input full-width no topo
- Cada `<RecordGridCard>` mostra capa quadrada, artist/title, ano, badges

## `/disco/[id]`

- Grid `[380px_1fr] gap-16`
- Sidebar esquerda sticky (380px): capa quadrada 380×380, meta dl, RecordControls, EnrichRecordButton, ReimportButton, links
- Direita: tracklist agrupada por lado com `<TrackCurationRow>` em grid `[36px_1fr_auto]`
- Cada row: posição mono (col 1) + título/rating/tags/preview/comment (col 2 flex-col) + toggle on/off + bomba (col 3)
- Botão grande "✓ Concluir e voltar à coleção" no header e no rodapé

## `/sets/[id]/montar`

- Layout 2 colunas: filtros/bag à esquerda + lista de candidatas à direita
- `<MontarFilters>` inline com BPM range, Camelot wheel, ChipPicker pra moods/contexts, Bomba filter
- `<CandidateRow>` em grid `[48px_auto_56px_1fr_auto_auto]`: cover, position badge, rating glyph, info bloco, BPM/tom/energia, +/✓ + remover

## `/curadoria`

- Layout vertical centralizado
- Capa grande, meta, botões ✓/✗/⏭

## `/status`

- Cards de sync runs em colunas
- AudioFeaturesBadge stats

## `/sets`

- Lista de sets como cards verticais
- Drag-and-drop reorder

## Estética compartilhada

- Tipografia: EB Garamond (serif) + JetBrains Mono (mono)
- Paleta: `--paper` (#f7f4ed) BG, `--ink` (#1a1a1a) texto, `--accent` (#a4332a) acento, `--line` (#d9d4c7) bordas
- Padding uniforme em containers: `max-w-[1240px] mx-auto px-8`
- Border-bottom em rows separadoras: `border-line-soft`

## Critérios de regressão (validar pós-009)

✅ = sem mudança em desktop após implementação 009.

- [ ] Header não muda (logo + 3 nav links visíveis + SyncBadge/Conta/UserButton)
- [ ] Home grid mantém 4 colunas em ≥1280px
- [ ] FilterBar mantém parede de chips inline
- [ ] `/disco/[id]` grid `[380px_1fr]` preservado com sidebar sticky
- [ ] TrackCurationRow grid `[36px_1fr_auto]` preservado em desktop
- [ ] CandidateRow grid 6 colunas preservado em desktop
- [ ] MontarFilters sidebar inline preservada em desktop
- [ ] Padding `px-8` mantido em containers principais em desktop
- [ ] Tipografia tamanhos preservados (h1 36px, faixa 19px italic, label-tech 10px mono)
