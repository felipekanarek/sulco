'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acknowledgeArchivedRecord } from '@/lib/actions';
import { CoverPlaceholder } from './cover-placeholder';
import { formatForDisplay } from '@/lib/tz';
import type { ArchivedPending } from '@/lib/queries/status';

export function ArchivedRecordRow({ record }: { record: ArchivedPending }) {
  const router = useRouter();
  const [coverFailed, setCoverFailed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ack() {
    setIsPending(true);
    setError(null);
    try {
      const res = await acknowledgeArchivedRecord({ recordId: record.recordId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <li className="grid grid-cols-[56px_1fr_auto] gap-4 py-4 border-b border-line-soft items-center">
      <Link
        href={`/disco/${record.recordId}`}
        className="w-14 h-14 block border border-line relative overflow-hidden"
      >
        {record.coverUrl && !coverFailed ? (
          <Image
            src={record.coverUrl}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="w-full h-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder artist={record.artist} />
        )}
      </Link>
      <div className="min-w-0">
        <p className="label-tech truncate">{record.artist}</p>
        <Link href={`/disco/${record.recordId}`}>
          <h3 className="font-serif italic text-[17px] leading-tight truncate hover:text-accent transition-colors">
            {record.title}
          </h3>
        </Link>
        <p className="label-tech text-ink-mute">
          arquivado {record.archivedAt ? formatForDisplay(record.archivedAt) : '—'} · curadoria preservada
        </p>
        {error ? <p className="text-xs text-warn mt-1">{error}</p> : null}
      </div>
      <button
        type="button"
        onClick={ack}
        disabled={isPending}
        className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-ink text-ink hover:bg-ink hover:text-paper rounded-sm disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        Reconhecer
      </button>
    </li>
  );
}
