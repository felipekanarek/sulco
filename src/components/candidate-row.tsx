'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addTrackToSet, removeTrackFromSet } from '@/lib/actions';
import { CoverPlaceholder } from './cover-placeholder';
import { BombaInline } from './bomba-badge';
import { Chip } from './chip';
import type { Candidate } from '@/lib/queries/montar';

const RATING_GLYPH: Record<number, string> = { 1: '+', 2: '++', 3: '+++' };
const CHIP_LIMIT_COMPACT = 4;

export function CandidateRow({
  candidate,
  setId,
  alreadyIn,
}: {
  candidate: Candidate;
  setId: number;
  alreadyIn: boolean;
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

  const containerClasses = inSet
    ? 'border-l-2 border-l-ok bg-ok/[0.04]'
    : '';

  return (
    <li
      className={`grid grid-cols-[48px_auto_56px_1fr_auto_auto] gap-4 py-4 border-b border-line-soft items-start ${containerClasses}`}
    >
      {/* Col 1: cover */}
      <Link
        href={`/disco/${candidate.recordId}`}
        className="w-12 h-12 block border border-line relative overflow-hidden mt-1"
        aria-label={`Abrir ${candidate.artist} — ${candidate.recordTitle}`}
      >
        {candidate.coverUrl && !coverFailed ? (
          <Image
            src={candidate.coverUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="w-full h-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder artist={candidate.artist} />
        )}
      </Link>

      {/* Col 2: badge de posição */}
      <span className="font-mono text-[13px] text-accent font-medium px-2 py-1 border border-accent/60 rounded-sm self-start mt-1">
        {candidate.position}
      </span>

      {/* Col 3: rating glyph */}
      <RatingGlyph rating={candidate.rating} />

      {/* Col 4: title + artist + meta + chips + comment */}
      <div className="min-w-0">
        <p className="font-serif italic text-[19px] leading-tight truncate">
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

        {candidate.fineGenre ? (
          <p className="label-tech text-ink-soft mt-0.5 truncate">
            {candidate.fineGenre}
          </p>
        ) : null}

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

      {/* Col 5: BPM/tom/energia */}
      <div className="label-tech text-right pr-2 whitespace-nowrap self-start mt-1">
        {candidate.bpm ? <span>{candidate.bpm} BPM</span> : null}
        {candidate.musicalKey ? <span> · {candidate.musicalKey}</span> : null}
        {candidate.energy ? <div>energia {candidate.energy}</div> : null}
      </div>

      {/* Col 6: toggle expand + add/remove + erro */}
      <div className="flex flex-col items-end gap-1 self-start mt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            className="w-8 h-8 rounded-sm border border-line hover:border-ink text-ink-soft hover:text-ink font-mono text-[14px] transition-colors"
          >
            {expanded ? '▾' : '▸'}
          </button>
          {inSet ? (
            <span
              className="w-10 h-10 rounded-full bg-ok/15 text-ok border border-ok/40 flex items-center justify-center font-serif text-[20px]"
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
              className="w-10 h-10 rounded-full border border-line hover:bg-ink hover:text-paper hover:border-ink font-serif text-[22px] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-mute transition-colors"
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
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute hover:text-warn px-2 py-1 border border-line hover:border-warn rounded-sm transition-colors disabled:opacity-50"
          >
            remover
          </button>
        ) : null}
        {error ? (
          <span className="text-[10px] text-warn max-w-[120px] text-right">
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
