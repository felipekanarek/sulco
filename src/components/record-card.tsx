'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { CollectionRow } from '@/lib/queries/collection';
import { CoverPlaceholder } from './cover-placeholder';
import { BombaBadge, BombaInline } from './bomba-badge';
import { ReimportButton } from './reimport-button';

type RecordRowProps = {
  record: CollectionRow;
};

/**
 * Linha de disco na listagem `/` (FR-005..FR-007). Layout editorial vertical
 * do protótipo original, traduzido para pt-BR.
 */
export function RecordRow({ record }: RecordRowProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const genresText = (record.genres ?? []).slice(0, 3).join(' · ');
  const stylesText = (record.styles ?? []).slice(0, 4).join(' · ');
  const metaLine = [record.label, record.year, record.format, record.country]
    .filter((x) => x && String(x).trim())
    .join(' · ');

  return (
    <li className="grid grid-cols-[64px_1fr] md:grid-cols-[72px_1fr_1fr_auto] gap-3 md:gap-6 items-start md:items-center py-4 md:py-6 border-b border-line-soft hover:bg-paper-raised transition-colors">
      <Link
        href={`/disco/${record.id}`}
        className="relative w-16 h-16 md:w-[72px] md:h-[72px] block cover overflow-hidden"
        aria-label={`Abrir ${record.artist} — ${record.title}`}
      >
        {record.coverUrl && !coverFailed ? (
          <Image
            src={record.coverUrl}
            alt=""
            width={72}
            height={72}
            sizes="72px"
            unoptimized
            className="w-full h-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder artist={record.artist} />
        )}
        {record.hasBomb ? (
          <span className="absolute top-1 right-1 bg-paper/95 rounded-sm px-1 py-0.5 shadow-sm">
            <BombaInline />
          </span>
        ) : null}
      </Link>

      {/* Wrapper: em mobile renderiza 3 blocos empilhados na col 2; em
          desktop vira display:contents e os 3 blocos ocupam cols 2/3/4
          do grid pai. */}
      <div className="flex flex-col gap-2 min-w-0 md:contents">
        <div className="min-w-0">
          <p className="label-tech mb-1 truncate flex items-center gap-2" title={record.artist}>
            <span className="truncate">{record.artist}</span>
            {record.hasBomb ? <BombaBadge size="md" /> : null}
            {record.tracksTotal > 0 ? (
              <span
                className="font-mono text-[11px] tabular-nums text-ink-mute whitespace-nowrap"
                aria-label={`${record.tracksSelected} de ${record.tracksTotal} faixas selecionadas`}
                title="Faixas selecionadas"
              >
                ·{' '}
                <span className="text-accent font-semibold">
                  {record.tracksSelected}
                </span>
                /{record.tracksTotal} faixas
              </span>
            ) : null}
          </p>
          <h3 className="font-serif italic text-[19px] md:text-[22px] font-medium tracking-tight leading-tight mb-1 md:mb-2 line-clamp-2 md:truncate">
            <Link
              href={`/disco/${record.id}`}
              className="hover:text-accent transition-colors"
            >
              {record.title}
            </Link>
          </h3>
          <p className="label-tech truncate" title={metaLine}>
            {metaLine || '—'}
          </p>
        </div>

        <div className="min-w-0">
          {genresText ? (
            <p
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink mb-1 truncate"
              title={record.genres.join(', ')}
            >
              {genresText}
            </p>
          ) : null}
          <p
            className="font-serif italic text-[13px] text-ink-soft mb-1 md:mb-2 truncate"
            title={record.styles.join(', ')}
          >
            {stylesText || '—'}
          </p>
          <p className="label-tech flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-mute">
            {record.shelfLocation ? <span>{record.shelfLocation}</span> : null}
            {coverFailed ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-warn">capa?</span>
                <ReimportButton recordId={record.id} variant="compact" />
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-row items-center justify-between gap-2 md:flex-col md:items-end md:justify-start mt-1 md:mt-0">
          <StatusBadge status={record.status} />
          <Link
            href={`/disco/${record.id}`}
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 min-h-[44px] flex items-center justify-center border border-ink text-ink hover:bg-ink hover:text-paper transition-colors rounded-sm"
          >
            Curadoria →
          </Link>
        </div>
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
