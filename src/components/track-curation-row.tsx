'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  analyzeTrackWithAI,
  updateTrackAiAnalysis,
  updateTrackCuration,
} from '@/lib/actions';
import { AudioFeaturesBadge } from './audio-features-badge';
import { BombaToggle } from './bomba-toggle';
import { CamelotWheel } from './camelot-wheel';
import { ChipPicker } from './chip-picker';
import { PreviewControls } from './preview-controls';

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
  aiAnalysis: string | null;
  isBomb: boolean;
  audioFeaturesSource: 'acousticbrainz' | 'manual' | null;
  // 008 — preview de áudio
  previewUrl: string | null;
  previewUrlCachedAt: Date | null;
};

type Props = {
  track: TrackData;
  recordId: number;
  recordArtist: string;
  moodSuggestions: string[];
  contextSuggestions: string[];
  /** 013 — habilita botão "✨ Analisar com IA" se DJ tem config Inc 14. */
  aiConfigured: boolean;
};

/**
 * Linha de faixa com curadoria (FR-016..FR-020c).
 * Campos editáveis só aparecem quando `selected=true`; os dados permanecem
 * no banco quando `selected` é desmarcado (FR-020).
 */
export function TrackCurationRow({
  track,
  recordId,
  recordArtist,
  moodSuggestions,
  contextSuggestions,
  aiConfigured,
}: Props) {
  const [local, setLocal] = useState<TrackData>(track);
  const [isPending, startTransition] = useTransition();
  // 013 — useTransition dedicado pra geração de IA: separar do save normal
  // pra não bloquear edição enquanto IA gera (3-30s).
  const [isAnalyzing, startAnalyzeTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Re-sincroniza state local quando audio features chegam do servidor
  // (router.refresh() após enrichRecordOnDemand). Atualiza só os 4 campos
  // de audio features + a flag de origem; preserva o resto do estado
  // local pra não atropelar edição em curso (rating, comment, isBomb...).
  useEffect(() => {
    setLocal((prev) => {
      const incomingChanged =
        prev.bpm !== track.bpm ||
        prev.musicalKey !== track.musicalKey ||
        prev.energy !== track.energy ||
        JSON.stringify(prev.moods) !== JSON.stringify(track.moods) ||
        prev.audioFeaturesSource !== track.audioFeaturesSource;
      if (!incomingChanged) return prev;
      return {
        ...prev,
        bpm: track.bpm,
        musicalKey: track.musicalKey,
        energy: track.energy,
        moods: track.moods,
        audioFeaturesSource: track.audioFeaturesSource,
      };
    });
    // Só re-sync quando audio features mudam — não trigger quando
    // outros campos mudam (evita race com edição local em curso).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    track.bpm,
    track.musicalKey,
    track.energy,
    track.moods,
    track.audioFeaturesSource,
  ]);

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

  // 013 — gerar análise via IA. Re-gerar com confirmação se já existe texto.
  function handleAnalyze() {
    if (local.aiAnalysis && local.aiAnalysis.trim().length > 0) {
      const ok = window.confirm('Substituir análise existente?');
      if (!ok) return;
    }
    setError(null);
    startAnalyzeTransition(async () => {
      const res = await analyzeTrackWithAI({ trackId: track.id });
      if (res.ok) {
        setLocal((prev) => ({ ...prev, aiAnalysis: res.data!.text }));
      } else {
        setError(res.error);
      }
    });
  }

  // 013 — edição manual da análise (auto-save-on-blur, mesmo pattern do comment).
  function saveAiAnalysis(next: string | null) {
    const prev = local.aiAnalysis;
    setLocal((cur) => ({ ...cur, aiAnalysis: next }));
    setError(null);
    startTransition(async () => {
      const res = await updateTrackAiAnalysis({
        trackId: track.id,
        recordId,
        text: next,
      });
      if (!res.ok) {
        setLocal((cur) => ({ ...cur, aiAnalysis: prev }));
        setError(res.error);
      }
    });
  }

  const positionCls = local.selected
    ? 'text-accent font-medium'
    : 'text-ink-mute';

  const actions = (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => save({ selected: !local.selected })}
        aria-pressed={local.selected}
        aria-label={local.selected ? 'Faixa selecionada — clique para desmarcar' : 'Clique para selecionar faixa'}
        className={`font-mono text-[11px] uppercase tracking-[0.1em] px-3 min-h-[44px] min-w-[48px] rounded-sm border transition-colors ${
          local.selected
            ? 'bg-ink text-paper border-ink'
            : 'text-ink-mute border-line hover:border-ink active:border-ink'
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
    </>
  );

  return (
    <article className="grid grid-cols-[28px_1fr] md:grid-cols-[36px_1fr_auto] gap-3 md:gap-4 py-4 border-b border-line-soft items-start">
      <span className={`font-mono text-[13px] tracking-wide pt-1 ${positionCls}`}>
        {local.position}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline gap-3 mb-2">
          <h3 className="font-serif italic text-[18px] md:text-[19px] leading-tight">{local.title}</h3>
          {local.duration ? (
            <span className="font-mono text-[11px] text-ink-mute">{local.duration}</span>
          ) : null}
        </div>

        <div className="mb-3">
          <PreviewControls
            trackId={local.id}
            artist={recordArtist}
            title={local.title}
            initialPreviewUrl={local.previewUrl}
            initialCachedAt={local.previewUrlCachedAt}
          />
        </div>

        {/* Rating (+, ++, +++) */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {[1, 2, 3].map((n) => {
            const active = local.rating === n;
            return (
              <button
                key={n}
                type="button"
                disabled={isPending || !local.selected}
                onClick={() => save({ rating: active ? null : n })}
                aria-label={`Avaliação ${'+'.repeat(n)}`}
                className={`font-mono text-[12px] px-2 py-1 border rounded-sm min-w-[44px] min-h-[44px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-accent text-paper border-accent'
                    : 'text-ink-mute border-line hover:border-ink hover:text-ink active:border-ink active:text-ink'
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

        {/* Tags: audio features (bpm/tom/energia/moods/badge) sempre
            visíveis quando têm dados — permite DJ ver sugestão ANTES
            de decidir selected. fineGenre/contexts/isBomb continuam só
            quando selected (são 100% autorais sem sugestão externa).
            Quando unselected, bloco aparece com opacidade reduzida. */}
        {local.bpm ||
        local.musicalKey ||
        local.energy ||
        local.moods.length > 0 ||
        (local.selected && (local.fineGenre || local.contexts.length > 0)) ? (
          <div
            className={`flex gap-2 flex-wrap items-center mb-2 ${local.selected ? '' : 'opacity-60'}`}
          >
            {local.bpm ? <Tag>{local.bpm} BPM</Tag> : null}
            {local.musicalKey ? <Tag variant="ink">{local.musicalKey}</Tag> : null}
            {local.energy ? <Tag>energia {local.energy}</Tag> : null}
            {local.selected && local.fineGenre ? <Tag variant="ink">{local.fineGenre}</Tag> : null}
            {local.moods.map((m) => (
              <Tag key={m} variant="mood">
                {m}
              </Tag>
            ))}
            {local.selected
              ? local.contexts.map((c) => (
                  <Tag key={c} variant="ctx">
                    {c}
                  </Tag>
                ))
              : null}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 p-4 bg-paper-raised border border-line-soft rounded-sm">
              <Field label="BPM (0–250)">
                <input
                  type="number"
                  inputMode="numeric"
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
                  inputMode="numeric"
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
              {/* 013 — Bloco "Análise" sempre visível (placeholder quando vazio).
                  Botão "✨ Analisar com IA" no canto direito. */}
              <div className="md:col-span-2 mt-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                    Análise
                  </p>
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={!aiConfigured || isAnalyzing}
                    title={
                      !aiConfigured
                        ? 'Configure sua chave em /conta'
                        : undefined
                    }
                    aria-label="Analisar faixa com IA"
                    className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAnalyzing ? 'Analisando…' : '✨ Analisar com IA'}
                  </button>
                </div>
                <textarea
                  key={local.aiAnalysis ?? 'empty'}
                  rows={3}
                  defaultValue={local.aiAnalysis ?? ''}
                  maxLength={5000}
                  placeholder="Sem análise — clique no botão pra gerar com IA"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const next = v === '' ? null : v;
                    if (next !== local.aiAnalysis) saveAiAnalysis(next);
                  }}
                  className="w-full font-serif text-[16px] bg-transparent border border-line p-2 outline-none focus:border-accent resize-y placeholder:text-ink-mute placeholder:italic"
                />
              </div>
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

        {/* Mobile-only: actions inline depois do conteúdo */}
        <div className="md:hidden flex items-center gap-2 mt-3 pt-3 border-t border-line-soft">
          {actions}
        </div>
      </div>

      {/* Desktop: actions na 3ª coluna */}
      <div className="hidden md:flex flex-col items-end gap-2 min-w-[96px]">
        {actions}
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
