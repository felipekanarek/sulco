'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { CollectionRow } from '@/lib/queries/collection';
import { CoverPlaceholder } from './cover-placeholder';

/**
 * Card de grade (visualização por capa). Compacto e visual,
 * equivalente ao que o Discogs mostra.
 */
export function RecordGridCard({ record }: { record: CollectionRow }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <article className="group flex flex-col">
      <Link
        href={`/disco/${record.id}`}
        className="relative block aspect-square overflow-hidden bg-paper-raised border border-line hover:border-ink-mute transition-colors"
        aria-label={`Abrir ${record.artist} — ${record.title}`}
      >
        {record.coverUrl && !coverFailed ? (
          <Image
            src={record.coverUrl}
            alt=""
            width={300}
            height={300}
            unoptimized
            className="w-full h-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder artist={record.artist} />
        )}
        {record.hasBomb ? (
          <span
            className="absolute top-2 right-2 bg-paper/90 px-2 py-1 text-base leading-none rounded"
            aria-label="Contém faixa Bomba"
          >
            💣
          </span>
        ) : null}
        <span
          className={`absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border bg-paper/90 ${statusStyle(record.status)}`}
        >
          {statusLabel(record.status)}
        </span>
      </Link>
      <div className="pt-3 flex flex-col gap-0.5">
        <p className="label-tech truncate" title={record.artist}>
          {record.artist}
        </p>
        <Link href={`/disco/${record.id}`}>
          <h3
            className="font-serif italic text-[17px] leading-tight line-clamp-2 hover:text-accent transition-colors"
            title={record.title}
          >
            {record.title}
          </h3>
        </Link>
        <p className="label-tech text-ink-mute mt-1">
          {record.tracksTotal > 0 ? (
            <>
              <span className="text-ink">{record.tracksSelected}</span>
              <span>/{record.tracksTotal} selecionadas</span>
            </>
          ) : (
            '—'
          )}
          {record.shelfLocation ? <span> · {record.shelfLocation}</span> : null}
        </p>
      </div>
    </article>
  );
}

function statusLabel(status: 'unrated' | 'active' | 'discarded') {
  return { active: 'Ativo', unrated: 'Não avaliado', discarded: 'Descartado' }[status];
}
function statusStyle(status: 'unrated' | 'active' | 'discarded') {
  return {
    active: 'text-ok border-ok',
    unrated: 'text-warn border-warn',
    discarded: 'text-ink-mute border-ink-mute',
  }[status];
}
