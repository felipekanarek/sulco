# Components — Contratos

## `<EditSetModal>` (NOVO)

### Props

```ts
type Props = {
  set: {
    id: number;
    name: string;
    eventDate: Date | null;
    location: string | null;
    briefing: string | null;
  };
};
```

### Responsabilidades

1. Renderizar botão "✏️ Editar set" quando fechado.
2. Renderizar modal com 4 inputs pré-preenchidos quando aberto.
3. Submit: chamar `updateSet({ setId, name, eventDate, location, briefing })` e fechar em sucesso.
4. Cancel: fechar modal sem persistir; ao reabrir, resetar campos pros valores atuais (effect).
5. ESC e clique no overlay fecham modal.

### State local

```ts
const [open, setOpen] = useState(false);
const [name, setName] = useState(set.name);
const [eventDate, setEventDate] = useState(formatForInput(set.eventDate));
const [location, setLocation] = useState(set.location ?? '');
const [briefing, setBriefing] = useState(set.briefing ?? '');
const [isPending, setIsPending] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### Reset effect (Decisão 7)

```ts
useEffect(() => {
  if (open) {
    setName(set.name);
    setEventDate(formatForInput(set.eventDate));
    setLocation(set.location ?? '');
    setBriefing(set.briefing ?? '');
    setError(null);
  }
}, [open, set]);
```

### Validation (client)

```ts
const isValid =
  name.trim().length > 0 &&
  name.length <= 200 &&
  briefing.length <= 5000;
```

Botão "Salvar" `disabled={!isValid || isPending}`.

### Handler `submit`

```ts
async function submit() {
  if (!isValid) return;
  setIsPending(true);
  setError(null);
  try {
    const res = await updateSet({
      setId: set.id,
      name: name.trim(),
      eventDate: eventDate ? new Date(eventDate) : null,
      location: location.trim() || null,
      briefing: briefing.trim() || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Erro inesperado.');
  } finally {
    setIsPending(false);
  }
}
```

### Helper `formatForInput`

```ts
function formatForInput(d: Date | null): string {
  if (!d) return '';
  // datetime-local aceita "YYYY-MM-DDTHH:mm" (sem segundos, sem TZ).
  // Browser interpreta como hora local — convenção America/Sao_Paulo.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
```

### Render structure

```tsx
if (!open) {
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 min-h-[44px] transition-colors"
    >
      ✏️ Editar set
    </button>
  );
}

return (
  <div
    onClick={(e) => {
      if (e.target === e.currentTarget) setOpen(false);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Escape') setOpen(false);
    }}
    className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-6"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-set-title"
      className="bg-paper border border-line max-w-[640px] w-full p-6 md:p-8 rounded-sm max-h-[90vh] overflow-y-auto"
    >
      <p className="eyebrow mb-2">Editar set</p>
      <h2 id="edit-set-title" className="font-serif italic text-[24px] md:text-[28px] mb-5">
        {set.name}
      </h2>

      {/* Nome */}
      <label className="flex flex-col gap-1 mb-4">
        <span className="label-tech">Nome</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoFocus
          className="font-serif text-[16px] bg-transparent border-b border-ink pb-2 outline-none focus:border-accent"
        />
      </label>

      {/* Data do evento */}
      <label className="flex flex-col gap-1 mb-4">
        <span className="label-tech">Data do evento (opcional)</span>
        <input
          type="datetime-local"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="font-mono text-[14px] bg-transparent border-b border-ink pb-2 outline-none focus:border-accent"
        />
      </label>

      {/* Local */}
      <label className="flex flex-col gap-1 mb-4">
        <span className="label-tech">Local (opcional)</span>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={200}
          className="font-serif text-[16px] bg-transparent border-b border-ink pb-2 outline-none focus:border-accent"
        />
      </label>

      {/* Briefing */}
      <label className="flex flex-col gap-1 mb-5">
        <span className="label-tech">Briefing (opcional)</span>
        <textarea
          rows={5}
          value={briefing}
          onChange={(e) => setBriefing(e.target.value)}
          maxLength={5000}
          className="font-serif text-[15px] bg-transparent border border-line p-2 outline-none focus:border-accent resize-y"
        />
        <span className="font-mono text-[11px] text-ink-mute self-end">
          {briefing.length} / 5000
        </span>
      </label>

      {error ? (
        <p role="alert" className="font-serif italic text-[14px] text-warn mb-4">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-4 py-2 min-h-[44px] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!isValid || isPending}
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink bg-ink text-paper hover:bg-paper hover:text-ink px-4 py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  </div>
);
```

## `/sets/[id]/montar/page.tsx` — integração

### Antes

Header da página tem título do set, eventDate, etc, sem botão de edição.

### Depois

```tsx
import { EditSetModal } from '@/components/edit-set-modal';

// No header, próximo ao título:
<EditSetModal
  set={{
    id: set.id,
    name: set.name,
    eventDate: set.eventDate,
    location: set.location,
    briefing: set.briefing,
  }}
/>
```

Posição exata depende do layout do header existente — a inspecionar
durante implementação. O wrapper `<EditSetModal>` decide se renderiza
botão (fechado) ou modal full-screen (aberto), então pode ficar em
qualquer canto do header sem afetar o resto do layout.
