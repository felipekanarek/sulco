'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { saveMontarFilters } from '@/lib/actions';
import { BombaFilter, type BombaFilterValue } from './bomba-filter';
import { CamelotWheel } from './camelot-wheel';
import { ChipPicker } from './chip-picker';
import type { MontarFilters } from '@/lib/queries/montar';

const DEBOUNCE_MS = 500;

type Props = {
  setId: number;
  initial: MontarFilters;
  moodSuggestions: string[];
  contextSuggestions: string[];
};

/**
 * Filtros da tela `/sets/[id]/montar` (FR-024, FR-024a).
 * - BPM/energy/rating: range min/max
 * - musicalKey: multi-select via CamelotWheel
 * - moods/contexts: ChipPicker (AND entre termos, FR-024)
 * - bomba: tri-state
 * - texto: busca livre
 * - persistência debounce 400ms (FR-024a) em sets.montarFiltersJson
 * - URL searchParams refletem estado para compartilhar/bookmarkar
 */
export function MontarFiltersForm({
  setId,
  initial,
  moodSuggestions,
  contextSuggestions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, setState] = useState<MontarFilters>(initial);
  const [, startTransition] = useTransition();
  const firstRenderRef = useRef(true);

  // Inc 28 Frente A: refs pra suportar flush on unmount.
  // Hoje cleanup só fazia clearTimeout — se DJ navegasse antes de 500ms,
  // último estado de filtros era perdido. Agora cleanup pega `pendingRef`
  // e dispara persist imediato fire-and-forget.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<MontarFilters | null>(null);

  // Propaga state → URL searchParams + persiste em sets.montarFiltersJson (debounce 500ms)
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    pendingRef.current = state;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const toPersist = pendingRef.current;
      if (!toPersist) return;
      // URL
      const next = new URLSearchParams(params);
      setParam(next, 'bpmMin', toPersist.bpm?.min);
      setParam(next, 'bpmMax', toPersist.bpm?.max);
      setParam(next, 'energyMin', toPersist.energy?.min);
      setParam(next, 'energyMax', toPersist.energy?.max);
      setParam(next, 'ratingMin', toPersist.rating?.min);
      setParam(next, 'ratingMax', toPersist.rating?.max);
      setMultiParam(next, 'key', toPersist.musicalKey);
      setMultiParam(next, 'mood', toPersist.moods);
      setMultiParam(next, 'context', toPersist.contexts);
      setParam(next, 'bomba', toPersist.bomba === 'any' ? undefined : toPersist.bomba);
      setParam(next, 'q', toPersist.text);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
      // DB (fire-and-forget; erros logados mas não bloqueiam UX)
      saveMontarFilters({ setId, filters: toPersist }).catch((err) =>
        console.error('[montar] saveMontarFilters falhou', err),
      );
      pendingRef.current = null;
      timerRef.current = null;
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Inc 28 Frente A: flush on unmount — se DJ navega antes do timer
  // expirar, dispara o persist pendente imediato (fire-and-forget).
  // Garante que preferência não é perdida em navegação rápida.
  useEffect(() => {
    return () => {
      if (timerRef.current && pendingRef.current) {
        clearTimeout(timerRef.current);
        const toFlush = pendingRef.current;
        saveMontarFilters({ setId, filters: toFlush }).catch(() => {});
        timerRef.current = null;
        pendingRef.current = null;
      }
    };
  }, [setId]);

  function clearAll() {
    setState({});
  }

  return (
    <section className="md:border md:border-line md:bg-paper-raised p-4 md:p-6 md:rounded-sm">
      <div className="flex justify-between items-baseline mb-4 md:mb-6 pb-3 border-b border-line-soft">
        <div>
          <p className="eyebrow text-accent">02 · filtros</p>
          <h2 className="font-serif italic text-[20px] md:text-[22px] font-medium">Busca precisa</h2>
        </div>
        <button
          type="button"
          onClick={clearAll}
          className="label-tech hover:text-accent active:text-accent underline min-h-[36px]"
        >
          limpar
        </button>
      </div>

      <div className="grid grid-cols-12 gap-3 md:gap-5">
        {/* BPM range */}
        <Field label="BPM de" span={2}>
          <NumberInput
            value={state.bpm?.min ?? null}
            min={0}
            max={250}
            onChange={(n) => setState((s) => ({ ...s, bpm: { ...s.bpm, min: n ?? undefined } }))}
          />
        </Field>
        <Field label="BPM até" span={2}>
          <NumberInput
            value={state.bpm?.max ?? null}
            min={0}
            max={250}
            onChange={(n) => setState((s) => ({ ...s, bpm: { ...s.bpm, max: n ?? undefined } }))}
          />
        </Field>

        {/* Energy range */}
        <Field label="Energia mín (1-5)" span={2}>
          <NumberInput
            value={state.energy?.min ?? null}
            min={1}
            max={5}
            onChange={(n) =>
              setState((s) => ({ ...s, energy: { ...s.energy, min: n ?? undefined } }))
            }
          />
        </Field>
        <Field label="Energia máx (1-5)" span={2}>
          <NumberInput
            value={state.energy?.max ?? null}
            min={1}
            max={5}
            onChange={(n) =>
              setState((s) => ({ ...s, energy: { ...s.energy, max: n ?? undefined } }))
            }
          />
        </Field>

        {/* Rating range */}
        <Field label="Rating mín (+ ++ +++)" span={2}>
          <NumberInput
            value={state.rating?.min ?? null}
            min={1}
            max={3}
            onChange={(n) =>
              setState((s) => ({ ...s, rating: { ...s.rating, min: n ?? undefined } }))
            }
          />
        </Field>
        <Field label="Rating máx" span={2}>
          <NumberInput
            value={state.rating?.max ?? null}
            min={1}
            max={3}
            onChange={(n) =>
              setState((s) => ({ ...s, rating: { ...s.rating, max: n ?? undefined } }))
            }
          />
        </Field>

        {/* Bomba + texto */}
        <Field label="Bomba" span={4}>
          <MontarBombaInline
            value={state.bomba ?? 'any'}
            onChange={(v) => setState((s) => ({ ...s, bomba: v === 'any' ? undefined : v }))}
          />
        </Field>
        <Field label="Texto livre" span={8}>
          <input
            type="search"
            defaultValue={state.text ?? ''}
            placeholder="título, artista, disco, gênero fino…"
            onChange={(e) =>
              setState((s) => ({ ...s, text: e.target.value || undefined }))
            }
            className="w-full font-serif text-[16px] bg-paper border border-line px-3 py-2 rounded-sm outline-none focus:border-ink"
          />
        </Field>

        {/* Camelot wheel */}
        <Field label="Tom (Camelot) — OU" span={12}>
          <CamelotMulti
            value={state.musicalKey ?? []}
            onChange={(arr) =>
              setState((s) => ({ ...s, musicalKey: arr.length > 0 ? arr : undefined }))
            }
          />
        </Field>

        {/* Moods AND */}
        <Field label="Moods (E)" span={6}>
          <ChipPicker
            value={state.moods ?? []}
            onChange={(arr) =>
              setState((s) => ({ ...s, moods: arr.length > 0 ? arr : undefined }))
            }
            suggestions={moodSuggestions}
            variant="mood"
          />
        </Field>

        {/* Contexts AND */}
        <Field label="Contextos (E)" span={6}>
          <ChipPicker
            value={state.contexts ?? []}
            onChange={(arr) =>
              setState((s) => ({ ...s, contexts: arr.length > 0 ? arr : undefined }))
            }
            suggestions={contextSuggestions}
            variant="ctx"
          />
        </Field>
      </div>
    </section>
  );
}

function Field({
  label,
  span,
  children,
}: {
  label: string;
  span: number;
  children: React.ReactNode;
}) {
  // Mobile-friendly: spans pequenos (BPM/Energy/Rating ranges) ficam 2 por linha em mobile;
  // spans médios (Bomba/Moods/Contexts) ocupam linha cheia; spans grandes preservados.
  const mobileSpanCls = span <= 2 ? 'col-span-6' : 'col-span-12';
  const desktopSpanCls =
    span === 2
      ? 'md:col-span-2'
      : span === 4
        ? 'md:col-span-4'
        : span === 6
          ? 'md:col-span-6'
          : span === 8
            ? 'md:col-span-8'
            : 'md:col-span-12';
  return (
    <div className={`${mobileSpanCls} ${desktopSpanCls} flex flex-col gap-2`}>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number | null;
  min?: number;
  max?: number;
  onChange: (n: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === '') return onChange(null);
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        onChange(n);
      }}
      className="font-serif text-[16px] bg-paper border border-line px-3 py-2 min-h-[44px] rounded-sm outline-none focus:border-ink"
    />
  );
}

function CamelotMulti({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(k: string) {
    onChange(value.includes(k) ? value.filter((v) => v !== k) : [...value, k]);
  }
  const numbers = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div className="space-y-2">
      <div>
        <p className="label-tech mb-1 text-ink-mute">Menores (A)</p>
        <div className="flex flex-wrap gap-1">
          {numbers.map((n) => {
            const k = `${n}A`;
            const active = value.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(k)}
                className={`font-mono text-[10px] px-2 py-1 border rounded-sm min-w-[32px] transition-colors ${
                  active
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-paper border-line text-ink-soft hover:border-ink hover:text-ink'
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="label-tech mb-1 text-ink-mute">Maiores (B)</p>
        <div className="flex flex-wrap gap-1">
          {numbers.map((n) => {
            const k = `${n}B`;
            const active = value.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(k)}
                className={`font-mono text-[10px] px-2 py-1 border rounded-sm min-w-[32px] transition-colors ${
                  active
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-paper border-line text-ink-soft hover:border-ink hover:text-ink'
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Versão inline "controlada" do BombaFilter (sem navegação via URL — manipula estado)
function MontarBombaInline({
  value,
  onChange,
}: {
  value: BombaFilterValue;
  onChange: (v: BombaFilterValue) => void;
}) {
  const cycle = () => {
    const next: BombaFilterValue = value === 'any' ? 'only' : value === 'only' ? 'none' : 'any';
    onChange(next);
  };
  const LABELS: Record<BombaFilterValue, string> = {
    any: 'qualquer',
    only: 'apenas Bomba',
    none: 'sem Bomba',
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value !== 'any'}
      aria-label={`Filtro Bomba: ${LABELS[value]}. Clique para alternar.`}
      onClick={cycle}
      className={`font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border rounded-sm inline-flex items-center gap-2 transition-colors ${
        value === 'only'
          ? 'bg-accent/10 border-accent text-ink'
          : value === 'none'
            ? 'bg-ink-mute/10 border-ink-mute text-ink-soft'
            : 'bg-paper border-line text-ink-mute hover:border-ink hover:text-ink'
      }`}
    >
      <span className="text-base leading-none">💣</span>
      <span>{LABELS[value]}</span>
    </button>
  );
}

function setParam(sp: URLSearchParams, key: string, value: string | number | undefined | null) {
  if (value === undefined || value === null || value === '' || Number.isNaN(value as number)) {
    sp.delete(key);
  } else {
    sp.set(key, String(value));
  }
}
function setMultiParam(sp: URLSearchParams, key: string, arr: string[] | undefined) {
  sp.delete(key);
  if (arr && arr.length > 0) for (const v of arr) sp.append(key, v);
}
