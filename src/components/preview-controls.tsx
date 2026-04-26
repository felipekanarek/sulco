'use client';

import { useEffect, useRef, useState } from 'react';
import { invalidateTrackPreview, resolveTrackPreview } from '@/lib/actions';
import { spotifySearchUrl, youtubeSearchUrl } from '@/lib/preview/urls';
import { usePreviewPlayer } from './preview-player-context';

type Props = {
  trackId: number;
  artist: string;
  title: string;
  initialPreviewUrl: string | null;
  initialCachedAt: Date | null;
};

type State =
  | { kind: 'idle'; deezerUrl: string | null; resolved: boolean }
  | { kind: 'loading' }
  | { kind: 'playing'; deezerUrl: string }
  | { kind: 'unavailable'; reason: 'no-deezer' | 'load-error' };

/**
 * 008 — Player inline + link-outs (FR-005).
 * Estados visuais (FR-006a): idle ▶ · loading ⟳ · playing ⏸ · unavailable.
 * Integração com Context "1 player ativo por vez" (FR-007).
 */
export function PreviewControls({
  trackId,
  artist,
  title,
  initialPreviewUrl,
  initialCachedAt,
}: Props) {
  const { currentTrackId, setCurrent } = usePreviewPlayer();

  // Hidrata estado a partir do cache do DB.
  // - cachedAt=null → nunca tentou (idle, deezerUrl=null, resolved=false)
  // - cachedAt+previewUrl='' → tentou, sem dado (unavailable: no-deezer)
  // - cachedAt+previewUrl=URL → cacheado (idle, deezerUrl=URL, resolved=true)
  const [state, setState] = useState<State>(() => {
    if (initialCachedAt == null) {
      return { kind: 'idle', deezerUrl: null, resolved: false };
    }
    if (!initialPreviewUrl || initialPreviewUrl.length === 0) {
      return { kind: 'unavailable', reason: 'no-deezer' };
    }
    return { kind: 'idle', deezerUrl: initialPreviewUrl, resolved: true };
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // FR-007: pausa quando outro player começa a tocar.
  useEffect(() => {
    if (state.kind === 'playing' && currentTrackId !== trackId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setState({ kind: 'idle', deezerUrl: state.deezerUrl, resolved: true });
    }
  }, [currentTrackId, trackId, state]);

  function startPlayback(url: string) {
    // Cleanup anterior (caso reuso após onError ou similar)
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.addEventListener('ended', () => {
      // FR-007a: termina e volta pro idle
      audioRef.current = null;
      setState({ kind: 'idle', deezerUrl: url, resolved: true });
      // Não chama setCurrent(null) — outro player pode ter assumido.
    });
    audio.addEventListener('error', () => {
      audioRef.current = null;
      setState({ kind: 'unavailable', reason: 'load-error' });
    });
    audioRef.current = audio;
    void audio.play().catch(() => {
      audioRef.current = null;
      setState({ kind: 'unavailable', reason: 'load-error' });
    });
    setState({ kind: 'playing', deezerUrl: url });
    setCurrent(trackId);
  }

  async function play() {
    if (state.kind === 'playing') return;
    if (state.kind === 'idle' && state.resolved) {
      if (state.deezerUrl) {
        startPlayback(state.deezerUrl);
        return;
      }
      // resolved sem URL = no-deezer; clique não devia chegar aqui (botão disabled),
      // mas por segurança:
      setState({ kind: 'unavailable', reason: 'no-deezer' });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'loading' });

    let res: Awaited<ReturnType<typeof resolveTrackPreview>>;
    try {
      res = await resolveTrackPreview({ trackId });
    } catch {
      if (controller.signal.aborted) return;
      setState({ kind: 'unavailable', reason: 'load-error' });
      return;
    }
    if (controller.signal.aborted) return;

    if (!res.ok) {
      setState({ kind: 'unavailable', reason: 'load-error' });
      return;
    }
    if (res.data?.deezerUrl) {
      startPlayback(res.data.deezerUrl);
      return;
    }
    setState({ kind: 'unavailable', reason: 'no-deezer' });
  }

  function pause() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (state.kind === 'playing') {
      setState({ kind: 'idle', deezerUrl: state.deezerUrl, resolved: true });
    }
  }

  async function retry() {
    abortRef.current?.abort();
    setState({ kind: 'loading' });
    const inv = await invalidateTrackPreview({ trackId });
    if (!inv.ok) {
      setState({ kind: 'unavailable', reason: 'load-error' });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let res: Awaited<ReturnType<typeof resolveTrackPreview>>;
    try {
      res = await resolveTrackPreview({ trackId });
    } catch {
      if (controller.signal.aborted) return;
      setState({ kind: 'unavailable', reason: 'load-error' });
      return;
    }
    if (controller.signal.aborted) return;
    if (!res.ok) {
      setState({ kind: 'unavailable', reason: 'load-error' });
      return;
    }
    if (res.data?.deezerUrl) {
      startPlayback(res.data.deezerUrl);
      return;
    }
    setState({ kind: 'unavailable', reason: 'no-deezer' });
  }

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      abortRef.current?.abort();
    };
  }, []);

  const spotifyHref = spotifySearchUrl(artist, title);
  const youtubeHref = youtubeSearchUrl(artist, title);

  return (
    <div className="flex items-center gap-2 flex-wrap" data-track-id={trackId}>
      <DeezerButton state={state} onPlay={play} onPause={pause} onRetry={retry} />
      {state.kind === 'unavailable' ? (
        <UnavailableNote reason={state.reason} onRetry={retry} />
      ) : null}
      <LinkOut href={spotifyHref} label="Spotify" />
      <LinkOut href={youtubeHref} label="YouTube" />
    </div>
  );
}

function DeezerButton({
  state,
  onPlay,
  onPause,
  onRetry,
}: {
  state: State;
  onPlay: () => void;
  onPause: () => void;
  onRetry: () => void;
}) {
  if (state.kind === 'playing') {
    return (
      <button
        type="button"
        onClick={onPause}
        aria-label="Pausar preview Deezer"
        className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 border rounded-sm bg-ink text-paper border-ink hover:bg-accent hover:border-accent transition-colors"
      >
        ⏸ Deezer
      </button>
    );
  }
  if (state.kind === 'loading') {
    return (
      <button
        type="button"
        disabled
        aria-label="Carregando preview Deezer"
        className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 border border-line rounded-sm text-ink-mute cursor-wait"
      >
        <span className="inline-block animate-spin">⟳</span> Deezer
      </button>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <button
        type="button"
        disabled
        aria-label="Preview Deezer indisponível"
        className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 border border-line rounded-sm text-ink-mute opacity-50 cursor-not-allowed"
      >
        ▶ Deezer
      </button>
    );
  }
  // idle
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label="Tocar preview Deezer (30s)"
      className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 border border-line rounded-sm text-ink hover:border-accent hover:text-accent transition-colors"
    >
      ▶ Deezer
    </button>
  );
}

function UnavailableNote({
  reason,
  onRetry,
}: {
  reason: 'no-deezer' | 'load-error';
  onRetry: () => void;
}) {
  const label =
    reason === 'no-deezer' ? 'sem preview' : 'preview indisponível';
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute italic">
        {label}
      </span>
      <button
        type="button"
        onClick={onRetry}
        aria-label="Tentar resolver preview novamente"
        className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute hover:text-accent underline-offset-2 hover:underline transition-colors"
      >
        tentar de novo
      </button>
    </span>
  );
}

function LinkOut({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 border border-line rounded-sm text-ink-mute hover:border-ink hover:text-ink transition-colors"
    >
      ↗ {label}
    </a>
  );
}
