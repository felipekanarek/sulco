/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PreviewPlayerProvider } from '@/components/preview-player-context';

// React 19 act() exige flag global no ambiente de testes
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 008 / T018a — FR-007 cross-componente: 2 <PreviewControls> coexistem,
 * play no segundo pausa o primeiro via Context.
 *
 * Mocks: Server Actions, HTMLAudioElement.play/pause.
 */

describe('008 — 1 player ativo por vez via Context (T018a, FR-007)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const playSpy = vi.fn(async () => {});
  const pauseSpy = vi.fn();
  const resolveSpy = vi.fn();
  const invalidateSpy = vi.fn();

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    playSpy.mockClear();
    pauseSpy.mockClear();
    resolveSpy.mockReset();
    invalidateSpy.mockReset();

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(playSpy as any);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pauseSpy as any);

    vi.doMock('@/lib/actions', () => ({
      resolveTrackPreview: resolveSpy,
      invalidateTrackPreview: invalidateSpy,
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.doUnmock('@/lib/actions');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('play em controle 2 dispara pause em controle 1', async () => {
    const { PreviewControls } = await import('@/components/preview-controls');

    // Pré-cacheia URLs nos dois controles via initialPreviewUrl/initialCachedAt
    // — assim play() não passa por Server Action; vai direto pro <audio>.
    const cachedAt = new Date();

    await act(async () => {
      root.render(
        <PreviewPlayerProvider>
          <PreviewControls
            trackId={1}
            artist="Spoon"
            title="Before Destruction"
            initialPreviewUrl="https://x/1.mp3"
            initialCachedAt={cachedAt}
          />
          <PreviewControls
            trackId={2}
            artist="Spoon"
            title="Is Love Forever?"
            initialPreviewUrl="https://x/2.mp3"
            initialCachedAt={cachedAt}
          />
        </PreviewPlayerProvider>,
      );
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Tocar preview Deezer (30s)"]');
    expect(buttons.length).toBe(2);

    // Aciona play no controle 1
    await act(async () => {
      buttons[0].click();
    });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();

    // Aciona play no controle 2 → controle 1 deve pausar via useEffect Context
    const buttons2 = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Tocar preview Deezer (30s)"]');
    expect(buttons2.length).toBeGreaterThan(0); // Pelo menos o controle 2 ainda está em idle (controle 1 virou playing => ⏸)
    // O controle 2 ainda tem aria-label="Tocar preview Deezer (30s)"
    await act(async () => {
      buttons2[buttons2.length - 1].click();
    });

    expect(playSpy).toHaveBeenCalledTimes(2);
    // Controle 1 chamou pause via useEffect ao detectar currentTrackId !== 1
    expect(pauseSpy).toHaveBeenCalled();

    // resolveTrackPreview NÃO foi chamado (cache local)
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});
