'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { Record } from '@/db/schema';
import { CoverPlaceholder } from './cover-placeholder';

type RecordRowProps = {
  record: Pick<
    Record,
    | 'id'
    | 'artist'
    | 'title'
    | 'year'
    | 'label'
    | 'country'
    | 'format'
    | 'coverUrl'
    | 'genres'
    | 'styles'
    | 'status'
    | 'shelfLocation'
  > & { hasBomb: boolean; tracksTotal: number; tracksSelected: number };
};

/**
 * Linha de disco na listagem `/` (FR-005..FR-007). Layout editorial vertical
 * do protótipo original, traduzido para pt-BR.
 */
export function RecordRow({ record }: RecordRowProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const stylesText = (record.styles ?? []).slice(0, 3).join(' · ');
  const metaLine = [record.label, record.year, record.format, record.country]
    .filter((x) => x && String(x).trim())
    .join(' · ');

  return (
    <li className="grid grid-cols-[72px_1fr_1fr_auto] gap-6 items-center py-6 border-b border-line-soft hover:bg-paper-raised transition-colors">
      <Link
        href={`/disco/${record.id}`}
        className="relative w-[72px] h-[72px] block cover overflow-hidden"
        aria-label={`Abrir ${record.artist} — ${record.title}`}
      >
        {record.coverUrl && !coverFailed ? (
          <Image
            src={record.coverUrl}
            alt=""
            width={72}
            height={72}
            unoptimized
            className="w-full h-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder artist={record.artist} />
        )}
        {record.hasBomb ? (
          <span
            className="absolute top-0 right-0 bg-paper/90 px-1 text-sm leading-none"
            aria-label="Contém faixa marcada como Bomba"
            title="Contém faixa Bomba"
          >
            💣
          </span>
        ) : null}
      </Link>

      <div className="min-w-0">
        <p className="label-tech mb-1 truncate" title={record.artist}>
          {record.artist}
        </p>
        <h3 className="font-serif italic text-[22px] font-medium tracking-tight leading-tight mb-2">
          <Link href={`/disco/${record.id}`} className="hover:text-accent transition-colors">
            {record.title}
          </Link>
        </h3>
        <p className="label-tech truncate" title={metaLine}>
          {metaLine || '—'}
        </p>
      </div>

      <div className="min-w-0">
        <p className="font-serif italic text-[13px] text-ink-soft mb-2 truncate">
          {stylesText || '—'}
        </p>
        <p className="label-tech">
          {record.tracksTotal > 0 ? (
            <>
              <span className="text-ink font-medium">{record.tracksSelected}</span>
              <span className="text-ink-mute">/{record.tracksTotal}</span>
              <span className="text-ink-mute"> selecionadas</span>
            </>
          ) : (
            '—'
          )}
          {record.shelfLocation ? (
            <span className="text-ink-mute"> · {record.shelfLocation}</span>
          ) : null}
          {coverFailed ? (
            <span
              className="text-warn ml-2"
              title="Capa indisponível. Use reimport na página do disco."
            >
              capa?
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <StatusBadge status={record.status} />
        <Link
          href={`/disco/${record.id}`}
          className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors rounded-sm"
        >
          Curadoria →
        </Link>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: 'unrated' | 'active' | 'discarded' }) {
  const cfg = {
    active: { label: 'Ativo', cls: 'text-ok border-ok' },
    unrated: { label: 'Não avaliado', cls: 'text-warn border-warn' },
    discarded: { label: 'Descartado', cls: 'text-ink-mute border-ink-mute' },
  }[status];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] px-3 py-1 border rounded-sm ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
