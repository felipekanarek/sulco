/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MobileDrawer } from '@/components/mobile-drawer';

// React 19 act() exige flag global no ambiente de testes
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 009 / T004 — invariantes do <MobileDrawer>:
 * (a) body.style.overflow vira 'hidden' quando open=true
 * (b) tap no overlay dispara onClose
 * (c) ESC dispara onClose
 * (d) overflow restaurado quando open vira false
 */

describe('009 — MobileDrawer state (T004)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    document.body.style.overflow = '';
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = '';
  });

  it('open=true trava body scroll com overflow=hidden', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <MobileDrawer open={true} onClose={onClose} side="left" ariaLabel="Test">
          <p>conteúdo</p>
        </MobileDrawer>,
      );
    });
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('open=true→false restaura overflow original', async () => {
    const onClose = vi.fn();
    document.body.style.overflow = 'auto';
    await act(async () => {
      root.render(
        <MobileDrawer open={true} onClose={onClose} side="left" ariaLabel="Test">
          <p>conteúdo</p>
        </MobileDrawer>,
      );
    });
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      root.render(
        <MobileDrawer open={false} onClose={onClose} side="left" ariaLabel="Test">
          <p>conteúdo</p>
        </MobileDrawer>,
      );
    });
    expect(document.body.style.overflow).toBe('auto');
  });

  it('tap no overlay (bg escurecido) chama onClose', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <MobileDrawer open={true} onClose={onClose} side="left" ariaLabel="Test">
          <p>conteúdo</p>
        </MobileDrawer>,
      );
    });

    // Overlay é o primeiro child com aria-hidden="true" + bg-ink/40
    const overlay = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(overlay).toBeTruthy();

    await act(async () => {
      overlay.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC dispara onClose quando aberto', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <MobileDrawer open={true} onClose={onClose} side="left" ariaLabel="Test">
          <p>conteúdo</p>
        </MobileDrawer>,
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC NÃO dispara onClose quando fechado', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <MobileDrawer open={false} onClose={onClose} side="left" ariaLabel="Test">
          <p>conteúdo</p>
        </MobileDrawer>,
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renderiza com role="dialog" e aria-modal=true e aria-label', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <MobileDrawer open={true} onClose={onClose} side="bottom" ariaLabel="Filtros">
          <p>filtros</p>
        </MobileDrawer>,
      );
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Filtros');
  });
});
