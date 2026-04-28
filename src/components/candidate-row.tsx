'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addTrackToSet, removeTrackFromSet } from '@/lib/actions';
import { CoverPlaceholder } from './cover-placeholder';
import { BombaInline } from './bomba-badge';
import { Chip } from './chip';
import { PreviewControls } from './preview-controls';
import type { Candidate } from '@/lib/queries/montar';

const RATING_GLYPH: Record<number, string> = { 1: '+', 2: '++', 3: '+++' };
const CHIP_LIMIT_COMPACT = 4;

export function CandidateRow({
  candidate,
  setId,
  alreadyIn,
  aiSuggestion,
}: {
  candidate: Candidate;
  setId: number;
  alreadyIn: boolean;
  /**
   * 014 (Inc 1): quando presente, renderiza badge "✨ Sugestão IA" +
   * justificativa em itálico. Card mantém comportamento de
   * "Adicionar ao set" via `add()` interno (chama addTrackToSet
   * existente).
   */
  aiSuggestion?: { justificativa: string };
}) {
  const router = useRouter();
  const [coverFailed, setCoverFailed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [inSet, setInSet] = useState(alreadyIn);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function add() {
    if (inSet || isPending) return;
    setInSet(true);
    setIsPending(true);
    setError(null);
    try {
      const res = await addTrackToSet({ setId, trackId: candidate.id });
      if (!res.ok) {
        setInSet(false);
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setInSet(false);
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsPending(false);
    }
  }

  async function remove() {
    if (!inSet || isPending) return;
    setInSet(false);
    setIsPending(true);
    setError(null);
    try {
      const res = await removeTrackFromSet({ setId, trackId: candidate.id });
      if (!res.ok) {
        setInSet(true);
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setInSet(true);
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsPending(false);
    }
  }

  const moodsVisible = candidate.moods.slice(0, CHIP_LIMIT_COMPACT);
  const moodsOverflow = Math.max(0, candidate.moods.length - CHIP_LIMIT_COMPACT);
  const contextsVisible = candidate.contexts.slice(0, CHIP_LIMIT_COMPACT);
  const contextsOverflow = Math.max(
    0,
    candidate.contexts.length - CHIP_LIMIT_COMPACT,
  );
  const hasChips =
    moodsVisible.length > 0 || contextsVisible.length > 0;
  const detailsId = `candidate-${candidate.id}-details`;

  // 015 (Inc 16): destaque visual extra quando é card de sugestão IA
  // (border accent grossa + bg paper-raised + padding maior + margin
  // entre cards). Aditivo ao destaque existente de "no set" (border-l-ok).
  const containerClasses = [
    inSet ? 'border-l-2 border-l-ok bg-ok/[0.04]' : '',
    aiSuggestion
      ? 'border-2 border-accent/60 bg-paper-raised px-3 md:px-4 mb-2 rounded-sm'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={`flex flex-col md:grid md:grid-cols-[48px_auto_56px_1fr_auto_auto] gap-3 md:gap-4 py-4 border-b border-line-soft md:items-start ${containerClasses}`}
    >
      {/* Mobile: row com cover + posição + rating; Desktop: cada um vira col 1/2/3 do grid pai via md:contents */}
      <div className="flex items-center gap-3 md:contents">
        <Link
          href={`/disco/${candidate.recordId}`}
          className="w-12 h-12 block border border-line relative overflow-hidden md:mt-1 shrink-0"
          aria-label={`Abrir ${candidate.artist} — ${candidate.recordTitle}`}
        >
          {candidate.coverUrl && !coverFailed ? (
            <Image
              src={candidate.coverUrl}
              alt=""
              width={48}
              height={48}
              sizes="48px"
              unoptimized
              className="w-full h-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <CoverPlaceholder artist={candidate.artist} />
          )}
        </Link>

        <span className="font-mono text-[13px] text-accent font-medium px-2 py-1 border border-accent/60 rounded-sm self-start md:mt-1 shrink-0">
          {candidate.position}
        </span>

        <RatingGlyph rating={candidate.rating} />
      </div>

      {/* Col 4 desktop / linha completa mobile: title + artist + meta + chips + comment */}
      <div className="min-w-0">
        {aiSuggestion ? (
          <span className="inline-block font-mono text-[11px] uppercase tracking-[0.14em] bg-accent text-paper px-2.5 py-1 mb-1.5">
            ✨ Sugestão IA
          </span>
        ) : null}
        <p className="font-serif italic text-[18px] md:text-[19px] leading-tight truncate">
          {candidate.title}
          {candidate.isBomb ? (
            <span className="ml-2 align-middle">
              <BombaInline />
            </span>
          ) : null}
        </p>
        <p className="label-tech truncate">
          {candidate.artist} ·{' '}
          <span className="text-ink-soft">{candidate.recordTitle}</span>
        </p>

        {candidate.recordGenres.length > 0 || candidate.recordStyles.length > 0 ? (
          <p
            className="mt-0.5 truncate"
            title={[...candidate.recordGenres, ...candidate.recordStyles].join(
              ' · ',
            )}
          >
            {candidate.recordGenres.length > 0 ? (
              <span className="label-tech text-ink">
                {candidate.recordGenres.slice(0, 3).join(' · ')}
              </span>
            ) : null}
            {candidate.recordGenres.length > 0 &&
            candidate.recordStyles.length > 0 ? (
              <span className="font-mono text-[10px] text-ink-mute mx-1">·</span>
            ) : null}
            {candidate.recordStyles.length > 0 ? (
              <span className="font-serif italic text-[13px] text-ink-soft">
                {candidate.recordStyles.slice(0, 3).join(' · ')}
              </span>
            ) : null}
          </p>
        ) : null}

        {candidate.fineGenre ? (
          <p className="label-tech text-ink-soft mt-0.5 truncate" title="Gênero refinado (curadoria)">
            {candidate.fineGenre}
          </p>
        ) : null}

        <div className="mt-2">
          <PreviewControls
            trackId={candidate.id}
            artist={candidate.artist}
            title={candidate.title}
            initialPreviewUrl={candidate.previewUrl}
            initialCachedAt={candidate.previewUrlCachedAt}
          />
        </div>

        {hasChips ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {moodsVisible.map((m) => (
              <Chip key={`m-${m}`} variant="mood">
                {m}
              </Chip>
            ))}
            {moodsOverflow > 0 ? (
              <Chip variant="ghost" title="Expandir pra ver todos">
                +{moodsOverflow} mais
              </Chip>
            ) : null}
            {contextsVisible.map((c) => (
              <Chip key={`c-${c}`} variant="context">
                {c}
              </Chip>
            ))}
            {contextsOverflow > 0 ? (
              <Chip variant="ghost" title="Expandir pra ver todos">
                +{contextsOverflow} mais
              </Chip>
            ) : null}
          </div>
        ) : null}

        {candidate.comment ? (
          <p
            className="font-serif italic text-[13px] text-ink-soft mt-1.5 line-clamp-1"
            title={candidate.comment}
          >
            “{candidate.comment}”
          </p>
        ) : null}

        {aiSuggestion ? (
          <p
            className="font-serif italic text-[15px] text-ink leading-relaxed mt-2"
            title={aiSuggestion.justificativa}
          >
            {aiSuggestion.justificativa}
          </p>
        ) : null}

        {/* Bloco expandido — só renderiza quando expanded */}
        {expanded ? (
          <div
            id={detailsId}
            className="mt-3 pt-3 border-t border-line-soft grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              {candidate.moods.length + candidate.contexts.length >
              CHIP_LIMIT_COMPACT * 2 ? (
                <div className="flex flex-wrap gap-1 mb-3">
                  {candidate.moods.map((m) => (
                    <Chip key={`em-${m}`} variant="mood">
                      {m}
                    </Chip>
                  ))}
                  {candidate.contexts.map((c) => (
                    <Chip key={`ec-${c}`} variant="context">
                      {c}
                    </Chip>
                  ))}
                </div>
              ) : null}
              {candidate.references ? (
                <div className="mb-3">
                  <p className="label-tech text-ink-mute mb-0.5">Referências</p>
                  <p className="font-serif italic text-[13px] text-ink-soft">
                    {candidate.references}
                  </p>
                </div>
              ) : null}
              {candidate.comment ? (
                <div>
                  <p className="label-tech text-ink-mute mb-0.5">Comentário</p>
                  <p className="font-serif italic text-[13px] text-ink whitespace-pre-line">
                    “{candidate.comment}”
                  </p>
                </div>
              ) : null}
            </div>
            <div>
              {candidate.shelfLocation ? (
                <p className="label-tech text-ink mb-3">
                  <span aria-hidden="true">📍</span>{' '}
                  <span className="text-ink-soft">{candidate.shelfLocation}</span>
                </p>
              ) : null}
              {candidate.recordNotes ? (
                <div>
                  <p className="label-tech text-ink-mute mb-0.5">
                    Sobre o disco
                  </p>
                  <p className="font-serif italic text-[13px] text-ink-soft whitespace-pre-line">
                    {candidate.recordNotes}
                  </p>
                </div>
              ) : null}
              <p className="mt-3">
                <Link
                  href={`/disco/${candidate.recordId}`}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft hover:text-accent transition-colors"
                >
                  → abrir curadoria
                </Link>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Col 5 desktop / mobile inline: BPM/tom/energia */}
      <div className="label-tech md:text-right md:pr-2 whitespace-nowrap md:self-start md:mt-1 flex flex-wrap gap-x-2 md:block">
        {candidate.bpm ? <span>{candidate.bpm} BPM</span> : null}
        {candidate.musicalKey ? <span className="md:before:content-['·_']"> · {candidate.musicalKey}</span> : null}
        {candidate.energy ? <span className="md:block"> · energia {candidate.energy}</span> : null}
      </div>

      {/* Col 6 desktop / final do stack mobile: toggle expand + add/remove + erro */}
      <div className="flex md:flex-col md:items-end items-center justify-between md:justify-start gap-2 md:gap-1 md:self-start md:mt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            className="w-11 h-11 md:w-8 md:h-8 rounded-sm border border-line hover:border-ink active:border-ink text-ink-soft hover:text-ink font-mono text-[14px] transition-colors"
          >
            {expanded ? '▾' : '▸'}
          </button>
          {inSet ? (
            <span
              className="w-11 h-11 md:w-10 md:h-10 rounded-full bg-ok/15 text-ok border border-ok/40 flex items-center justify-center font-serif text-[20px]"
              aria-label="Faixa já na bag"
            >
              ✓
            </span>
          ) : (
            <button
              type="button"
              onClick={add}
              disabled={isPending}
              aria-label="Adicionar faixa ao set"
              className="w-11 h-11 md:w-10 md:h-10 rounded-full border border-line hover:bg-ink hover:text-paper hover:border-ink active:bg-ink active:text-paper font-serif text-[22px] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-mute transition-colors"
            >
              +
            </button>
          )}
        </div>
        {inSet ? (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            aria-label="Remover faixa da bag"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute hover:text-warn active:text-warn px-2 py-1 min-h-[36px] border border-line hover:border-warn active:border-warn rounded-sm transition-colors disabled:opacity-50"
          >
            remover
          </button>
        ) : null}
        {error ? (
          <span className="text-[10px] text-warn max-w-[160px] text-right">
            {error}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Glifo de rating literal +/++/+++ com escalonamento de peso visual:
 *  - `null`          → não renderiza nada (FR-003, FR-004)
 *  - `1` (`+`)       → neutro cinza (`ink-mute`)
 *  - `2` (`++`)      → neutro preto (`ink`)
 *  - `3` (`+++`)     → destaque vermelho bold (`accent`, `font-semibold`)
 */
function RatingGlyph({ rating }: { rating: number | null }) {
  if (!rating) return <span aria-hidden="true" />;
  const hint =
    rating === 3
      ? 'muito boa para tocar'
      : rating === 2
        ? 'boa'
        : 'boa, mas nem tanto';
  const cls =
    rating === 3
      ? 'text-accent font-semibold'
      : rating === 2
        ? 'text-ink'
        : 'text-ink-mute';
  return (
    <span
      title={hint}
      className={`font-mono text-center tracking-tight text-[18px] self-start mt-1 ${cls}`}
    >
      {RATING_GLYPH[rating]}
    </span>
  );
}
