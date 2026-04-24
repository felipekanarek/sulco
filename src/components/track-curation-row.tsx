'use client';

import { useState, useTransition } from 'react';
import { updateTrackCuration } from '@/lib/actions';
import { AudioFeaturesBadge } from './audio-features-badge';
import { BombaToggle } from './bomba-toggle';
import { CamelotWheel } from './camelot-wheel';
import { ChipPicker } from './chip-picker';

export type TrackData = {
  id: number;
  position: string;
  title: string;
  duration: string | null;
  selected: boolean;
  bpm: number | null;
  musicalKey: string | null;
  energy: number | null;
  rating: number | null;
  moods: string[];
  contexts: string[];
  fineGenre: string | null;
  references: string | null;
  comment: string | null;
  isBomb: boolean;
  audioFeaturesSource: 'acousticbrainz' | 'manual' | null;
};

type Props = {
  track: TrackData;
  recordId: number;
  moodSuggestions: string[];
  contextSuggestions: string[];
};

/**
 * Linha de faixa com curadoria (FR-016..FR-020c).
 * Campos editáveis só aparecem quando `selected=true`; os dados permanecem
 * no banco quando `selected` é desmarcado (FR-020).
 */
export function TrackCurationRow({
  track,
  recordId,
  moodSuggestions,
  contextSuggestions,
}: Props) {
  const [local, setLocal] = useState<TrackData>(track);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function save(patch: Partial<TrackData>) {
    // Otimista: aplica local, envia ao servidor, reverte em erro
    const prev = local;
    const next = { ...local, ...patch };
    setLocal(next);
    setError(null);
    startTransition(async () => {
      const res = await updateTrackCuration({
        trackId: track.id,
        recordId,
        ...patch,
      });
      if (!res.ok) {
        setLocal(prev);
        setError(res.error);
      }
    });
  }

  const positionCls = local.selected
    ? 'text-accent font-medium'
    : 'text-ink-mute';

  return (
    <article className="grid grid-cols-[36px_1fr_auto] gap-4 py-4 border-b border-line-soft items-start">
      <span className={`font-mono text-[13px] tracking-wide pt-1 ${positionCls}`}>
        {local.position}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline gap-3 mb-2">
          <h3 className="font-serif italic text-[19px] leading-tight">{local.title}</h3>
          {local.duration ? (
            <span className="font-mono text-[11px] text-ink-mute">{local.duration}</span>
          ) : null}
        </div>

        {/* Rating (+, ++, +++) */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3].map((n) => {
            const active = local.rating === n;
            return (
              <button
                key={n}
                type="button"
                disabled={isPending || !local.selected}
                onClick={() => save({ rating: active ? null : n })}
                aria-label={`Avaliação ${'+'.repeat(n)}`}
                className={`font-mono text-[12px] px-2 py-1 border rounded-sm min-w-[40px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-accent text-paper border-accent'
                    : 'text-ink-mute border-line hover:border-ink hover:text-ink'
                }`}
              >
                {'+'.repeat(n)}
              </button>
            );
          })}
          {!local.selected ? (
            <span className="label-tech text-ink-mute ml-2">
              marque "on" para curar
            </span>
          ) : null}
        </div>

        {/* Tags visíveis quando selected */}
        {local.selected &&
        (local.bpm ||
          local.musicalKey ||
          local.energy ||
          local.fineGenre ||
          local.moods.length > 0 ||
          local.contexts.length > 0) ? (
          <div className="flex gap-2 flex-wrap items-center mb-2">
            {local.bpm ? <Tag>{local.bpm} BPM</Tag> : null}
            {local.musicalKey ? <Tag variant="ink">{local.musicalKey}</Tag> : null}
            {local.energy ? <Tag>energia {local.energy}</Tag> : null}
            {local.fineGenre ? <Tag variant="ink">{local.fineGenre}</Tag> : null}
            {local.moods.map((m) => (
              <Tag key={m} variant="mood">
                {m}
              </Tag>
            ))}
            {local.contexts.map((c) => (
              <Tag key={c} variant="ctx">
                {c}
              </Tag>
            ))}
            <AudioFeaturesBadge source={local.audioFeaturesSource} />
          </div>
        ) : null}

        {local.comment ? (
          <p className="font-serif italic text-[16px] text-ink-soft leading-relaxed pl-3 border-l-2 border-line mt-2">
            {local.comment}
          </p>
        ) : null}
        {local.references ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute mt-2">
            ref · {local.references}
          </p>
        ) : null}

        {/* Editor expansível só quando selected */}
        {local.selected ? (
          <details
            open={open}
            onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
            className="mt-3"
          >
            <summary className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute cursor-pointer hover:text-accent">
              {open ? 'fechar editor' : 'editar curadoria'}
            </summary>
            <div className="grid grid-cols-2 gap-4 mt-3 p-4 bg-paper-raised border border-line-soft rounded-sm">
              <Field label="BPM (0–250)">
                <input
                  type="number"
                  min={0}
                  max={250}
                  defaultValue={local.bpm ?? ''}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const n = raw === '' ? null : Number(raw);
                    if (n === null || (Number.isInteger(n) && n >= 0 && n <= 250)) {
                      if (n !== local.bpm) save({ bpm: n });
                    }
                  }}
                  className="w-full font-serif text-[16px] bg-transparent border-0 border-b border-ink pb-1 outline-none focus:border-accent"
                />
              </Field>
              <Field label="Energia (1–5)">
                <input
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={local.energy ?? ''}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const n = raw === '' ? null : Number(raw);
                    if (n === null || (Number.isInteger(n) && n >= 1 && n <= 5)) {
                      if (n !== local.energy) save({ energy: n });
                    }
                  }}
                  className="w-full font-serif text-[16px] bg-transparent border-0 border-b border-ink pb-1 outline-none focus:border-accent"
                />
              </Field>
              <Field label="Gênero fino" colSpan={2}>
                <input
                  type="text"
                  defaultValue={local.fineGenre ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== local.fineGenre) save({ fineGenre: v });
                  }}
                  className="w-full font-serif text-[16px] bg-transparent border-0 border-b border-ink pb-1 outline-none focus:border-accent"
                />
              </Field>
              <Field label="Tom (Camelot)" colSpan={2}>
                <CamelotWheel
                  value={local.musicalKey}
                  onChange={(k) => save({ musicalKey: k })}
                  disabled={isPending}
                />
              </Field>
              <Field label="Moods" colSpan={2}>
                <ChipPicker
                  value={local.moods}
                  onChange={(arr) => save({ moods: arr })}
                  suggestions={moodSuggestions}
                  variant="mood"
                  disabled={isPending}
                />
              </Field>
              <Field label="Contextos" colSpan={2}>
                <ChipPicker
                  value={local.contexts}
                  onChange={(arr) => save({ contexts: arr })}
                  suggestions={contextSuggestions}
                  variant="ctx"
                  disabled={isPending}
                />
              </Field>
              <Field label="Comentário" colSpan={2}>
                <textarea
                  rows={3}
                  defaultValue={local.comment ?? ''}
                  maxLength={5000}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== local.comment) save({ comment: v });
                  }}
                  className="w-full font-serif text-[16px] bg-transparent border border-line p-2 outline-none focus:border-accent resize-y"
                />
              </Field>
              <Field label="Referências" colSpan={2}>
                <input
                  type="text"
                  defaultValue={local.references ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== local.references) save({ references: v });
                  }}
                  className="w-full font-serif text-[16px] bg-transparent border-0 border-b border-ink pb-1 outline-none focus:border-accent"
                />
              </Field>
            </div>
          </details>
        ) : null}

        {error ? <p className="text-xs text-warn mt-2">{error}</p> : null}
      </div>

      <div className="flex flex-col items-end gap-2 min-w-[96px]">
        <button
          type="button"
          disabled={isPending}
          onClick={() => save({ selected: !local.selected })}
          aria-pressed={local.selected}
          aria-label={local.selected ? 'Faixa selecionada — clique para desmarcar' : 'Clique para selecionar faixa'}
          className={`font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-2 rounded-sm border min-w-[48px] transition-colors ${
            local.selected
              ? 'bg-ink text-paper border-ink'
              : 'text-ink-mute border-line hover:border-ink'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {local.selected ? 'on' : 'off'}
        </button>
        <BombaToggle
          value={local.isBomb}
          onChange={(v) => save({ isBomb: v })}
          disabled={isPending || !local.selected}
          compact
        />
      </div>
    </article>
  );
}

function Tag({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: 'mood' | 'ctx' | 'ink';
}) {
  const cls = {
    mood: 'text-accent border-accent-soft',
    ctx: 'text-ok border-ok',
    ink: 'text-ink border-ink',
    default: 'text-ink-soft border-line',
  }[variant ?? 'default'];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border rounded-sm bg-paper ${cls}`}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <div style={colSpan ? { gridColumn: `span ${colSpan}` } : undefined}>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}
