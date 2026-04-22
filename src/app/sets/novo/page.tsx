import { redirect } from 'next/navigation';
import { createSet } from '@/lib/actions';

export default function NovoSetPage() {
  async function handle(formData: FormData) {
    'use server';
    const id = await createSet(formData);
    redirect(`/sets/${id}/montar`);
  }

  return (
    <div className="max-w-[720px] mx-auto px-8">
      <section className="pb-6 border-b border-line mb-8">
        <p className="eyebrow mb-2">novo set</p>
        <h1 className="title-display text-[36px]">Montar set</h1>
      </section>

      <form action={handle} className="flex flex-col gap-8">
        <FormField label="Nome do set">
          <input
            type="text"
            name="name"
            required
            placeholder="Ex.: Aniversário da Ana"
            className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[22px] italic placeholder:text-ink-mute outline-none focus:border-accent"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-6">
          <FormField label="Data do evento">
            <input
              type="datetime-local"
              name="eventDate"
              className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[19px] outline-none focus:border-accent"
            />
          </FormField>
          <FormField label="Local">
            <input
              type="text"
              name="location"
              placeholder="Cidade ou venue"
              className="w-full bg-transparent border-0 border-b border-ink pb-2 font-serif text-[19px] italic placeholder:text-ink-mute outline-none focus:border-accent"
            />
          </FormField>
        </div>

        <FormField label="Briefing do evento">
          <textarea
            name="briefing"
            rows={6}
            placeholder="Descreva o clima, público, horários, gêneros…"
            className="w-full bg-transparent border border-dashed border-line p-4 font-serif text-[19px] italic placeholder:text-ink-mute outline-none focus:border-ink focus:border-solid rounded-sm resize-y"
          />
        </FormField>

        <div className="flex justify-end gap-4 pt-6 border-t border-line">
          <button
            type="submit"
            className="font-mono text-[11px] uppercase tracking-[0.12em] bg-ink text-paper px-8 py-4 rounded-sm hover:bg-accent"
          >
            Criar e montar →
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}
