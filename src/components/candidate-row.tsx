'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addTrackToSet } from '@/lib/actions';
import { CoverPlaceholder } from './cover-placeholder';
import { BombaInline } from './bomba-badge';
import type { Candidate } from '@/lib/queries/montar';

const RATING_GLYPH: Record<number, string> = { 1: '+', 2: '++', 3: '+++' };

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
      // Força o Next a re-buscar a árvore RSC para que o SetSidePanel
      // (bag física, contadores, lista à direita) reflita o novo estado.
      // O revalidatePath sozinho não é suficiente quando a action é
      // chamada diretamente como função no cliente em Next 15.
      router.refresh();
    } catch (err) {
      setInSet(false);
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <li
      className={`grid grid-cols-[48px_auto_56px_1fr_auto_auto] gap-4 py-4 border-b border-line-soft items-center ${
        inSet ? 'opacity-50' : ''
      }`}
    >
      <Link
        href={`/disco/${candidate.recordId}`}
        className="w-12 h-12 block border border-line relative overflow-hidden"
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

      <span className="font-mono text-[13px] text-accent font-medium px-2 py-1 border border-accent/60 rounded-sm">
        {candidate.position}
      </span>

      <RatingGlyph rating={candidate.rating} />

      <div className="min-w-0">
        <p className="font-serif italic text-[19px] leading-tight truncate">
          {candidate.title}
          {candidate.isBomb ? <span className="ml-2"><BombaInline /></span> : null}
        </p>
        <p className="label-tech truncate">
          {candidate.artist} · <span className="text-ink-soft">{candidate.recordTitle}</span>
        </p>
        {candidate.moods.length > 0 || candidate.contexts.length > 0 ? (
          <p className="font-serif italic text-[13px] text-ink-soft mt-1 truncate">
            {[...candidate.moods, ...candidate.contexts].slice(0, 4).join(' · ')}
          </p>
        ) : null}
      </div>

      <div className="label-tech text-right pr-2 whitespace-nowrap">
        {candidate.bpm ? <span>{candidate.bpm} BPM</span> : null}
        {candidate.musicalKey ? <span> · {candidate.musicalKey}</span> : null}
        {candidate.energy ? <div>energia {candidate.energy}</div> : null}
      </div>

      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={add}
          disabled={inSet || isPending}
          aria-label={inSet ? 'Faixa já no set' : 'Adicionar faixa ao set'}
          className="w-10 h-10 rounded-full border border-line hover:bg-ink hover:text-paper hover:border-ink font-serif text-[22px] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-mute transition-colors"
        >
          {inSet ? '✓' : '+'}
        </button>
        {error ? <span className="text-[10px] text-warn max-w-[120px]">{error}</span> : null}
      </div>
    </li>
  );
}

function RatingGlyph({ rating }: { rating: number | null }) {
  if (!rating) {
    return (
      <span className="font-mono text-[13px] text-ink-mute text-center" title="sem avaliação">
        —
      </span>
    );
  }
  const hint = rating === 3 ? 'muito boa para tocar' : rating === 2 ? 'boa' : 'boa, mas nem tanto';
  return (
    <span
      title={hint}
      className="font-mono font-semibold text-accent text-center tracking-tight text-[18px]"
    >
      {RATING_GLYPH[rating]}
    </span>
  );
}
