# Research — Inc 16 (UI rework sugestões IA inline)

## Decisão 1: arquitetura — `<MontarCandidates>` client wrapper

**Decisão**: criar componente client `<MontarCandidates>` que recebe
do RSC: `candidates: Candidate[]`, `inSetIds: number[]`, `setId:
number`, `aiConfigured: boolean`. Mantém estado local de sugestões
e renderiza lista única (sugestões dedupliados no topo + restantes
embaixo). Botões "Sugerir com IA" / "Ignorar sugestões" no header
do componente.

**Rationale**:
- Centraliza a lógica de orquestração em um único componente — o
  RSC `page.tsx` passa props simples e fica limpo.
- Estado das sugestões fica encapsulado (não vaza pra outros
  contexts).
- Pattern coerente com `<AISuggestionsPanel>` antigo (que também
  era client) — apenas escopo expande pra incluir a lista.

**Alternativas consideradas**:
- **Subir estado pra `<MontarPageWrapper>`**: força page inteira
  virar client, perde benefício de RSC pra outras partes. Rejeitado.
- **Manter `<AISuggestionsPanel>` separado + lista RSC**: bate de
  frente com FR-002 (lista única).
- **Server Action que devolve lista combinada**: requer round-trip
  pra cada Sugerir/Ignorar, perde reset client-side rápido (SC-004).

## Decisão 2: cores e tokens do destaque visual

**Decisão**:
- **Border**: `border-2 border-accent/60` (mais grossa que cards
  comuns, com 60% de opacity pra não ser agressivo).
- **Background**: `bg-paper-raised` (já existe no design system,
  contraste sutil com `paper`).
- **Espaço**: `p-4` ou `p-5` (padding maior que cards comuns)
  pra moldura respirar.
- **Margem entre cards de sugestão**: `mb-2` ou similar pra
  separar visualmente (cards sugeridos não colam).
- **Badge "✨ Sugestão IA"**: `bg-accent text-paper px-2.5 py-1
  text-[11px] uppercase tracking-[0.14em] font-mono`. Solid
  accent com texto paper — mais proeminente que a versão Inc 14
  (que era só border + texto accent).
- **Justificativa**: `text-[15px] italic text-ink leading-relaxed`
  (ao invés do `text-[14px] italic text-ink-soft` do Inc 14).
  Tamanho maior + cor mais escura = destaque sem virar shouty.

**Rationale**:
- Reusa tokens do projeto (`accent`, `paper-raised`, `ink`,
  `ink-soft`) — sem CSS novo.
- Border mais grossa (2px vs 1px default) é o sinal mais forte de
  destaque sem precisar de cor alternativa.
- Badge com bg sólido (não outline) destaca mais — alinha com
  user feedback "Badge claro de que é sugerido pela IA".

**Alternativas consideradas**:
- **Border accent solid 100%**: muito agressivo, "grita".
- **Bg em accent/5 (5% opacity)**: muito sutil, talvez invisível
  em alguns monitores.
- **Border colorida + bg saturado**: dois sinais fortes brigando.
  Single-channel highlight é mais elegante.

## Decisão 3: posição dos botões "Sugerir" / "Ignorar"

**Decisão**: header dedicado do `<MontarCandidates>` exibe:
- À esquerda: título "Candidatos" (existente) + contador
  (ex: "12 sugestões IA + 188 outros · 200 faixas").
- À direita: botões "Sugerir com IA" e "Ignorar sugestões"
  (segundo só aparece quando há sugestões).

Mobile: header ainda tem o título mas botões podem quebrar pra
linha de baixo (`flex-wrap gap-2`).

**Rationale**:
- Manter alinhamento com o header existente "Candidatos" — apenas
  estende. Sem section nova com header separado (poluição visual).
- Botões à direita do título = pattern padrão (toolbar de seção).
- Contador ajuda DJ entender "tenho X sugestões + Y comuns".

**Alternativas consideradas**:
- **Botão "Sugerir" flutuante (fixed)**: foge do pattern editorial
  do Sulco (NYT Magazine + Teenage Engineering). Rejeitado.
- **Botão dentro do header de filtros**: dissocia visualmente da
  ação que afeta a listagem. Pior UX.

## Decisão 4: estratégia de dedup (FR-002a)

**Decisão**: client-side via `Set<number>`. Quando há sugestões:
```ts
const suggestedIds = new Set(suggestions.map(s => s.trackId));
const commonCandidates = candidates.filter(c => !suggestedIds.has(c.id));
```

Render: sugestões na ordem da IA, depois `commonCandidates` na
ordem original. Cada sugestão precisa do dado completo do candidate
pra renderizar — usa `candidatesById` cache (já existe no Inc 14
via `data.candidates`).

**Rationale**:
- O(N) dedup, trivial pra acervos de 200-300 candidatos.
- Nada server-side necessário — `suggestSetTracks` já filtra IDs
  inválidos; o que chega ao client é confiável.
- Sem mudança em `queryCandidates` ou Server Action.

**Alternativas considerardas**:
- **Server-side filter**: forçaria action devolver tanto sugestões
  quanto lista filtrada. Mais payload, sem ganho. Rejeitado.

## Decisão 5: comportamento de cards adicionados (Inc 14 mantido)

**Decisão**: cards de sugestão e comuns têm o MESMO comportamento
de "adicionar" — usa `<CandidateRow>` interno que chama
`addTrackToSet`. O card não some após adicionar; mostra flag visual
"✓ no set" do CandidateRow existente. Cards de sugestão **mantêm
moldura e justificativa** mesmo após adicionar (DJ pode reler).

**Rationale**:
- Inc 14 já estabeleceu: sugestões persistem visíveis pós-adição
  (FR-008 do Inc 14). Inc 16 herda comportamento.
- Reutilizar `<CandidateRow>` evita duplicar lógica de
  add/remove.

## Decisão 6: comportamento ao "Ignorar sugestões"

**Decisão**: reset apenas do estado client `{ kind: 'idle' }`.
- Sugestões somem do topo.
- Lista de candidatos comuns volta sem dedup (todos os candidates
  do server reaparecem na ordem original).
- Botão "Ignorar" some.
- Botão "Sugerir" volta visível (alinhado com Inc 14: sempre
  visível quando aiConfigured, exceto durante geração).

**Rationale**:
- Reset puro, idempotente. Nenhum side-effect.
- DJ pode clicar "Sugerir" novamente — geração nova, sem
  confirmação (não há sugestões pendentes pra preservar).

## Decisão 7: deletar `<AISuggestionsPanel>` antigo

**Decisão**: remover arquivo `src/components/ai-suggestions-panel.tsx`
após criar `<MontarCandidates>` e remover sua chamada do page.tsx.

**Rationale**:
- Não há outros usos no código (grep confirma).
- Deixar arquivo "morto" gera dúvida em revisões futuras.
- Princípio "preservar em vez de destruir" da constituição vale
  pra DADOS do DJ, não pra código não-usado.

**Alternativas consideradas**:
- **Manter como deprecated**: poluição. Rejeitado.

## Decisão 8: estado de loading durante "Sugerir"

**Decisão**: durante geração, header mostra "Sugerindo…" no botão
e a listagem **continua visível** (candidates comuns não somem).
Sugestões anteriores (se havia) permanecem até resposta nova
chegar. Em sucesso, lista re-renderiza com novo dedup.

**Rationale**:
- Não tirar conteúdo da tela durante carregamento — DJ pode
  continuar lendo cards comuns enquanto espera.
- Pattern do Inc 14 mantido (botão pendente, sem skeleton).

**Alternativas consideradas**:
- Skeleton/placeholder durante geração: complexidade desnecessária
  pra MVP.
