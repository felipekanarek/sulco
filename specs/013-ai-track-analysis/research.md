# Research — Inc 13 (Análise da faixa via IA)

## Decisão 1: posição visual do bloco "Análise"

**Decisão**: bloco "Análise" aparece **abaixo** do bloco "Sua nota"
(`comment`) dentro do estado expandido (`open=true`) do
`<TrackCurationRow>`. Layout vertical empilhado em todas as
viewports — não tenta colocar lado a lado.

**Rationale**:
- Card já tem hierarquia vertical densa: chips (mood/context) →
  sliders (rating/energy) → CamelotWheel → BPM → "Sua nota" →
  "Análise". Adicionar lateral quebra fluxo de leitura.
- Mobile (≤640px, alinha 009): lado-a-lado é impossível com
  textareas legíveis. Evita 2 layouts diferentes.
- "Sua nota" vem primeiro porque é nota humana — semanticamente
  mais autoral.

**Alternativas consideradas**:
- **Lado a lado em desktop, empilhado em mobile**: 2 layouts pra
  manter, sem ganho real (DJ não compara lado a lado em prática).
- **Tabs ("Nota" | "Análise")**: esconde uma das partes; spec Q1
  decide que ambas ficam sempre visíveis.

## Decisão 2: estratégia de auto-save-on-blur do `aiAnalysis`

**Decisão**: action dedicada `updateTrackAiAnalysis(trackId, text | null)`,
**não** estender `updateTrackCuration` existente.

**Rationale**:
- `updateTrackCuration` lida com 11 campos AUTHOR (rating, bpm, key,
  energy, moods, contexts, fineGenre, references, comment, isBomb,
  selected). Adicionar 1 mais inflaria a função genérica.
- Action dedicada é mais legível, fácil de auditar (é a única que
  toca `ai_analysis` por edição manual; `analyzeTrackWithAI` toca
  por geração). Separa as 2 zonas de escrita.
- Custo: ~10 linhas a mais que estender.

**Alternativas considerardas**:
- **Estender `updateTrackCuration`** com `aiAnalysis` opcional no
  patch: simples mas piora coesão da função.
- **Action única `setTrackAiAnalysis`** que serve ambos casos
  (geração + edição manual): geração precisa orquestrar adapter +
  prompt + ownership; edição precisa só persistir. Misturar
  responsabilidades é pior.

## Decisão 3: query que monta `TrackData` em `/disco/[id]/page.tsx`

**Decisão**: estender o select existente em [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx)
pra incluir `aiAnalysis: tracks.aiAnalysis` no objeto. Estender o
type `TrackData` em
[src/components/track-curation-row.tsx](../../src/components/track-curation-row.tsx)
pra incluir `aiAnalysis: string | null`.

**Rationale**:
- Drizzle select é granular (só campos pedidos). 1 coluna nova é
  zero impacto em performance.
- Type derivado mantém o TS compiler validando todos os caminhos
  (page → row → save → adapter).

**Alternativas considerardas**:
- **Lazy-load do `aiAnalysis`** sob demanda quando expand: gera
  request extra, dificulta refresh pós-`analyzeTrackWithAI`.
  Rejeitado.

## Decisão 4: builder de prompt em arquivo dedicado

**Decisão**: criar [src/lib/prompts/track-analysis.ts](../../src/lib/prompts/track-analysis.ts)
exportando `buildTrackAnalysisPrompt(track, record): string`. Função
pura, testável, documentada.

```ts
export function buildTrackAnalysisPrompt(input: {
  artist: string;
  album: string;
  year: number | null;
  trackTitle: string;
  position: string;
  genres: string[];
  styles: string[];
  bpm: number | null;
  musicalKey: string | null;
  energy: number | null;
}): string {
  // L1 essencial
  const yearStr = input.year ? ` (${input.year})` : '';
  const l1 = `${input.artist} - ${input.album}${yearStr} - ${input.trackTitle} (${input.position})`;

  // L2 contexto (só campos não-nulos)
  const ctx: string[] = [];
  if (input.genres.length) ctx.push(`Gêneros: ${input.genres.join(', ')}`);
  if (input.styles.length) ctx.push(`Estilos: ${input.styles.join(', ')}`);
  if (input.bpm) ctx.push(`BPM: ${input.bpm}`);
  if (input.musicalKey) ctx.push(`Tom: ${input.musicalKey}`);
  if (input.energy) ctx.push(`Energia: ${input.energy}/5`);
  const l2 = ctx.length ? ctx.join(' | ') : '(sem metadados adicionais)';

  // L3 instrução
  const l3 =
    "Em pt-BR, máximo 500 caracteres, 3-4 frases curtas. Foque em " +
    "sensação musical e uso em set (mood, contexto, posição típica). " +
    "Não invente fatos biográficos. Se não conhecer a faixa, descreva " +
    "honestamente o que dá pra inferir dos metadados.";

  return `${l1}\n${l2}\n\n${l3}`;
}
```

**Rationale**:
- Prompt evolui com o tempo (tuning baseado em respostas reais);
  isolar em arquivo próprio facilita iteração.
- Função pura: pode ser testada via unit test futuro sem
  inicializar IA.
- Inc 1 (briefing) seguirá pattern análogo em
  `src/lib/prompts/set-briefing.ts`.

## Decisão 5: ownership check da `analyzeTrackWithAI`

**Decisão**: helper `assertTrackOwnership(userId, trackId)` no
início da action faz JOIN entre `tracks → records` e verifica
`records.user_id === userId`. Falha → `{ ok: false, error: 'Faixa não encontrada.' }`.

**Rationale**:
- Pattern já usado em `updateTrackCuration` (linha
  ~ a verificar). Manter consistência.
- Mensagem genérica ("não encontrada") evita disclosure de
  existência de tracks de outros users (mesma estratégia
  `requireOwner`/`notFound`).

**Alternativas consideradas**:
- **Verificar via Drizzle relational com filtro de user**: API
  relacional é mais verbosa pra um single check; preferir 1 query
  explícita.

## Decisão 6: comportamento ao editar `aiAnalysis` pra vazio

**Decisão**: trim no client antes de enviar. Se `text.trim() === ''`,
enviar `null` pra ação. Action persiste `null` (não string vazia)
pra UI render placeholder consistente com track novo.

**Rationale**:
- Evita estado ambíguo string vazia vs null no DB.
- FR-006 explicitamente exige `NULL`.
- Trim no client é safe (DJ não pode digitar só whitespace e
  esperar que conte como conteúdo).

## Decisão 7: adicionar `aiAnalysis` ao histórico de campos AUTHOR de tracks

**Decisão**: editar `.specify/memory/constitution.md` Princípio I
adicionando `aiAnalysis` à lista de campos autorais de `tracks`,
com nota "(IA escreve via clique do DJ; DJ pode editar)" — explicita
que é AUTHOR híbrido.

Bump constituição: **1.1.0** (MINOR — adição de campo à lista
existente, não muda regra).

**Rationale**:
- Princípio I lista explicitamente os campos AUTHOR. Sem adicionar
  `aiAnalysis`, a constituição fica desatualizada e qualquer review
  futuro pode questionar a zona do campo.
- Histórico de decisões em CLAUDE.md também ganha entrada.

**Alternativas consideradas**:
- **Não atualizar constituição**: deixa débito documental. Rejeitado.
- **Bump MAJOR**: muda comportamento? Não — só estende lista.
  Rejeitado.

## Decisão 8: ordem de aplicação do schema em prod

**Decisão**: aplicar `ALTER TABLE tracks ADD COLUMN ai_analysis TEXT`
em prod via Turso CLI **antes do push** (mesmo padrão Inc 010/012).
