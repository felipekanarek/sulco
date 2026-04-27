'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateRecordStatus } from '@/lib/actions';
import { CoverPlaceholder } from './cover-placeholder';
import { BombaInline } from './bomba-badge';
import type { CuradoriaDisc, CuradoriaStatusFilter } from '@/lib/queries/curadoria';

type Status = 'unrated' | 'active' | 'discarded';

type Props = {
  disc: CuradoriaDisc;
  ids: number[];
  currentIndex: number;
  status: CuradoriaStatusFilter;
};

/**
 * View de triagem sequencial (FR-008..FR-015).
 * Atalhos de teclado (FR-013):
 *   A → marca `active` e avança
 *   D → marca `discarded` e avança
 *   → → pula sem alterar status
 *   ← → volta sem alterar status
 *   (barra de espaço para `selected` de faixa fica em /disco/[id] em US2.2)
 */
export function CuradoriaView({ disc, ids, currentIndex, status }: Props) {
  const router = useRouter();
  const [coverFailed, setCoverFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState<Status>(disc.status);

  const total = ids.length;
  const atFirst = currentIndex <= 0;
  const atLast = currentIndex >= total - 1;
  const prevId = atFirst ? null : ids[currentIndex - 1];
  const nextId = atLast ? null : ids[currentIndex + 1];

  function qs(fromId: number) {
    return `?status=${status}&from=${fromId}`;
  }

  function goNext() {
    if (atLast) {
      router.push(`/curadoria/concluido?status=${status}&total=${total}`);
      return;
    }
    if (nextId) router.push(`/curadoria${qs(nextId)}`);
  }
  function goPrev() {
    if (prevId) router.push(`/curadoria${qs(prevId)}`);
  }
  function applyStatus(newStatus: Status) {
    setLocalStatus(newStatus);
    startTransition(async () => {
      const res = await updateRecordStatus({ recordId: disc.id, status: newStatus });
      if (!res.ok) {
        // Reverte visual em caso de erro (FR-012: avançar só após sucesso)
        setLocalStatus(disc.status);
        return;
      }
      goNext();
    });
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Não interferir em campos editáveis (inputs, textareas, contenteditable)
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          t.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        applyStatus('active');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        applyStatus('discarded');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, ids, status]);

  const meta = [disc.label, disc.year, disc.format, disc.country]
    .filter((x) => x && String(x).trim())
    .join(' · ');
  const stylesText = (disc.styles ?? []).slice(0, 5).join(' · ');
  const genresText = (disc.genres ?? []).slice(0, 4).join(' · ');
  const selectedCount = disc.tracks.filter((t) => t.selected).length;
  const bombCount = disc.tracks.filter((t) => t.isBomb).length;

  return (
    <>
      {/* Head */}
      <section className="flex flex-col md:grid md:grid-cols-[1fr_auto] md:items-end gap-3 md:gap-8 pb-4 md:pb-6 border-b border-line mb-6 md:mb-8">
        <div>
          <p className="eyebrow mb-2">Curadoria · {labelForStatus(status)}</p>
          <h1 className="title-display text-[30px] md:text-[44px]">Triagem</h1>
        </div>
        <div className="flex justify-between md:justify-end gap-6 items-end">
          <span className="font-serif italic text-[24px] md:text-[32px] leading-none">
            <span className="text-ink">{currentIndex + 1}</span>
            <span className="text-ink-mute"> de {total}</span>
          </span>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 min-h-[44px] flex items-center justify-center border border-line text-ink-mute hover:border-ink hover:text-ink rounded-full"
          >
            Sair
          </Link>
        </div>
      </section>

      {/* Disc */}
      <section className="flex flex-col md:grid md:grid-cols-[320px_1fr] gap-6 md:gap-10 md:items-start">
        <div className="cover w-full md:w-[320px] aspect-square md:h-[320px] relative overflow-hidden border border-line bg-paper-raised">
          {disc.coverUrl && !coverFailed ? (
            <Image
              src={disc.coverUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              unoptimized
              className="object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <CoverPlaceholder artist={disc.artist} />
          )}
        </div>

        <div className="min-w-0">
          <p className="eyebrow mb-2">{disc.artist}</p>
          <h2
            className="font-serif italic text-[28px] md:text-[40px] font-medium tracking-tight leading-[1.05] mb-3 md:mb-5"
            title={disc.title}
          >
            {disc.title}
          </h2>
          <p className="label-tech mb-2">{meta || '—'}</p>
          {genresText ? (
            <p className="font-serif italic text-[14px] md:text-[15px] text-ink-soft mb-1">{genresText}</p>
          ) : null}
          {stylesText ? (
            <p className="font-serif italic text-[13px] text-ink-mute mb-5 md:mb-6">{stylesText}</p>
          ) : (
            <div className="mb-5 md:mb-6" />
          )}

          {/* Actions: mobile = grid 2-col com Ativo/Descartado fullwidth + nav abaixo;
              desktop = layout flex-wrap atual */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-3 mb-4 md:mb-8">
            <ActionButton
              label="Ativo"
              shortcut="A"
              tone="ok"
              active={localStatus === 'active'}
              disabled={isPending}
              onClick={() => applyStatus('active')}
            />
            <ActionButton
              label="Descartado"
              shortcut="D"
              tone="mute"
              active={localStatus === 'discarded'}
              disabled={isPending}
              onClick={() => applyStatus('discarded')}
            />
            <div className="col-span-2 md:col-span-1 flex items-center gap-1 md:ml-2">
              <NavButton
                label="← anterior"
                onClick={goPrev}
                disabled={atFirst || isPending}
                ariaLabel="Disco anterior"
              />
              <NavButton
                label={atLast ? 'concluir →' : 'próximo →'}
                onClick={goNext}
                disabled={isPending}
                ariaLabel={atLast ? 'Tela de conclusão' : 'Próximo disco'}
              />
            </div>
            <Link
              href={`/disco/${disc.id}`}
              className="col-span-2 md:col-span-1 md:ml-auto font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 min-h-[44px] flex items-center justify-center border border-ink text-ink hover:bg-ink hover:text-paper active:bg-ink active:text-paper rounded-sm"
            >
              Abrir disco →
            </Link>
          </div>

          <p className="label-tech text-ink-mute hidden md:block">
            Atalhos: <kbd className="kbd">A</kbd> Ativo ·{' '}
            <kbd className="kbd">D</kbd> Descartado · <kbd className="kbd">→</kbd> próximo ·{' '}
            <kbd className="kbd">←</kbd> anterior
          </p>

          {disc.tracks.length > 0 ? (
            <div className="mt-6 pt-6 border-t border-line-soft">
              <p className="label-tech mb-3">
                Tracklist · {disc.tracks.length} faixas
                {selectedCount > 0 ? <span className="text-ok"> · {selectedCount} selecionadas</span> : null}
                {bombCount > 0 ? <span className="text-accent"> · {bombCount} bomba{bombCount > 1 ? 's' : ''}</span> : null}
              </p>
              <ol className="space-y-1">
                {disc.tracks.map((t) => (
                  <li
                    key={t.id}
                    className="grid grid-cols-[auto_1fr_auto] gap-4 items-baseline py-1 text-[14px]"
                  >
                    <span className="font-mono text-[11px] text-ink-mute w-10">{t.position}</span>
                    <span
                      className={
                        t.selected ? 'font-serif italic text-ink' : 'font-serif italic text-ink-soft'
                      }
                    >
                      {t.title}
                      {t.isBomb ? <span className="ml-2"><BombaInline /></span> : null}
                      {t.selected ? <span className="ml-2 text-ok text-xs">●</span> : null}
                    </span>
                    <span className="font-mono text-[10px] text-ink-mute">
                      {t.duration ?? '—'}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="mt-6 pt-6 border-t border-line-soft">
              <p className="label-tech text-warn">
                Tracklist indisponível no Discogs. Abra o disco e clique "Reimportar este disco" para tentar novamente.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function labelForStatus(s: CuradoriaStatusFilter) {
  return {
    unrated: 'não avaliados',
    active: 'ativos',
    discarded: 'descartados',
    all: 'todos',
  }[s];
}

function ActionButton({
  label,
  shortcut,
  tone,
  active,
  disabled,
  onClick,
}: {
  label: string;
  shortcut: string;
  tone: 'ok' | 'mute';
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const base = 'font-mono text-[11px] uppercase tracking-[0.12em] px-5 py-3 min-h-[56px] border rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';
  const toneCls = active
    ? tone === 'ok'
      ? 'bg-ok text-paper border-ok'
      : 'bg-ink-mute text-paper border-ink-mute'
    : tone === 'ok'
      ? 'border-ok text-ok hover:bg-ok/10'
      : 'border-ink-mute text-ink-soft hover:bg-ink-mute/10';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${toneCls}`}>
      <span>{label}</span>
      <kbd className="kbd">{shortcut}</kbd>
    </button>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex-1 md:flex-none font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-3 min-h-[44px] flex items-center justify-center border border-line hover:border-ink active:border-ink rounded-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );
}
