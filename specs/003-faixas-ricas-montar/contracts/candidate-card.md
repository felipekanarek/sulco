# Contract: CandidateCard (003)

## Componente

`src/components/candidate-row.tsx` — `export function CandidateRow`
(mantém nome do arquivo + função pra não quebrar imports).

## Props

```typescript
type CandidateRowProps = {
  candidate: Candidate;  // tipo de queries/montar.ts, expandido em 003
  setId: number;
  alreadyIn: boolean;    // true se a faixa já está na bag do set
};
```

## Estado interno (client-only)

```typescript
const [expanded, setExpanded] = useState(false);
const [inSet, setInSet] = useState(alreadyIn); // herdado
const [isPending, setIsPending] = useState(false);
const [coverFailed, setCoverFailed] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Contract**:

- `expanded` é inicializado `false` sempre (default); FR-008.
- `inSet` é inicializado com `alreadyIn` (vindo do server); mantém
  comportamento atual.
- Ao adicionar/remover faixa da bag, `expanded` NÃO é alterado
  (FR-014b).

## Modos de render

### Modo compacto (default)

Layout grid semelhante ao atual mas expandido pra acomodar novos
campos. Estrutura de alto nível:

```tsx
<li className={rowClasses}>
  {/* Col 1: cover 48x48 */}
  {/* Col 2: badge de posição */}
  {/* Col 3: RatingGlyph (ou null) */}
  {/* Col 4: título + artista + (compact-extras) */}
  {/* Col 5: BPM/tom/energia */}
  {/* Col 6: ExpandToggle + add/remove */}
</li>
```

**compact-extras** (novo, dentro da coluna 4):

```tsx
<div className="mt-1 flex flex-wrap items-center gap-1.5">
  {candidate.fineGenre ? <FineGenreTag value={candidate.fineGenre} /> : null}
  {candidate.moods.slice(0, 4).map((m) => <Chip variant="mood" key={m}>{m}</Chip>)}
  {candidate.moods.length > 4 ? <Chip variant="ghost">+{candidate.moods.length - 4} mais</Chip> : null}
  {candidate.contexts.slice(0, 4).map((c) => <Chip variant="context" key={c}>{c}</Chip>)}
  {candidate.contexts.length > 4 ? <Chip variant="ghost">+{candidate.contexts.length - 4} mais</Chip> : null}
</div>
{candidate.comment ? (
  <p className="font-serif italic text-[13px] text-ink-soft mt-1.5 line-clamp-1" title={candidate.comment}>
    "{candidate.comment}"
  </p>
) : null}
```

### Modo expandido

Mesma estrutura + bloco inferior inteiro apenas pra info enriquecida:

```tsx
{expanded ? (
  <div className="col-span-full mt-3 pt-3 border-t border-line-soft grid grid-cols-2 gap-4">
    {/* coluna esquerda: detalhes da faixa */}
    <div>
      {candidate.moods.length > 4 || candidate.contexts.length > 4 ? (
        <AllChips moods={candidate.moods} contexts={candidate.contexts} />
      ) : null}
      {candidate.references ? (
        <p className="font-serif italic text-[13px] text-ink-soft mt-2">
          <span className="label-tech">Referências</span>
          <br />
          {candidate.references}
        </p>
      ) : null}
      {candidate.comment ? (
        <p className="font-serif italic text-[13px] text-ink mt-2 whitespace-pre-line">
          "{candidate.comment}"
        </p>
      ) : null}
    </div>
    {/* coluna direita: contexto do disco */}
    <div>
      {candidate.shelfLocation ? (
        <p className="label-tech">
          📍 {candidate.shelfLocation}
        </p>
      ) : null}
      {candidate.recordNotes ? (
        <div className="mt-2">
          <span className="label-tech">Sobre o disco</span>
          <p className="font-serif italic text-[13px] text-ink-soft whitespace-pre-line">
            {candidate.recordNotes}
          </p>
        </div>
      ) : null}
    </div>
  </div>
) : null}
```

## Toggle de expansão

```tsx
<button
  type="button"
  onClick={() => setExpanded((e) => !e)}
  aria-expanded={expanded}
  aria-controls={`candidate-${candidate.id}-details`}
  aria-label={expanded ? 'Recolher detalhes' : 'Expandir detalhes'}
  className="..."
>
  {expanded ? '▾' : '▸'}
</button>
```

**Contract**:

- Roda 100% no cliente — zero fetch.
- Transição CSS (opcional) ≤100ms (FR-009).
- Estado isolado por candidato (FR-007).

## Marcação "já na bag"

Quando `inSet === true`:

```tsx
<li className="... border-l-2 border-l-ok bg-ok/5 opacity-80">
  ...
  {/* Botão add vira pair de confirma+remove */}
  <div className="flex items-center gap-2">
    <span className="w-8 h-8 rounded-full bg-ok/20 text-ok flex items-center justify-center">✓</span>
    <button
      type="button"
      onClick={remove}
      aria-label="Remover da bag"
      className="text-[10px] text-ink-mute hover:text-warn px-2 py-1 border border-line hover:border-warn rounded-sm transition-colors"
    >
      remover
    </button>
  </div>
</li>
```

**Contract**:

- Card permanece na lista filtrada (FR-014a).
- `expanded` state preservado (FR-014b).
- `remove` chama Server Action `removeTrackFromSet` (já existe).
- Após remove bem-sucedido: `inSet=false`, marcação some, botão `+`
  volta.

## Chip component

Novo componente compartilhado:

```tsx
type ChipProps = {
  variant: 'mood' | 'context' | 'ghost';
  children: React.ReactNode;
};

export function Chip({ variant, children }: ChipProps) {
  const cls = {
    mood: 'bg-accent-soft text-ink border-accent/40',
    context: 'bg-transparent text-ink-soft border-line',
    ghost: 'bg-transparent text-ink-mute border-dashed border-line',
  }[variant];
  return (
    <span className={`inline-block font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 border rounded-sm ${cls}`}>
      {children}
    </span>
  );
}
```

**Contract**:

- Três variants distinguíveis por cor/border.
- Altura uniforme, não quebra linha.
- Reusável em outras telas no futuro.

## Performance

- Render do compact sem chips extras: igual ao atual.
- Render com chips (até 4 por grupo): +2-4ms por card — imperceptível.
- Toggle expand → setState → re-render só daquele `<li>`. Sem fetch,
  sem revalidation. ≤100ms percepção.

## Acessibilidade

- `aria-expanded` + `aria-controls` no toggle (disclosure widget).
- Contraste AA mantido: moods `ink on accent-soft`, contexts `ink-soft
  on paper`, ghost `ink-mute on paper`.
- Keyboard: Enter/Space ativam o toggle (default de `<button>`).
- Screen reader: labels descritivos em botão + região expandida com
  `id={candidate-N-details}`.
