'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// 008 — React Context "1 player ativo por vez" (FR-007).
// Cada <PreviewControls> compara `currentTrackId !== myTrackId` e pausa o
// próprio <audio>. Volume "1 inteiro" — sem re-render storm.

type Ctx = {
  currentTrackId: number | null;
  setCurrent: (id: number | null) => void;
};

const PreviewPlayerContext = createContext<Ctx | null>(null);

export function PreviewPlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null);

  const setCurrent = useCallback((id: number | null) => {
    setCurrentTrackId(id);
  }, []);

  const value = useMemo<Ctx>(() => ({ currentTrackId, setCurrent }), [currentTrackId, setCurrent]);

  return (
    <PreviewPlayerContext.Provider value={value}>{children}</PreviewPlayerContext.Provider>
  );
}

export function usePreviewPlayer(): Ctx {
  const ctx = useContext(PreviewPlayerContext);
  if (!ctx) {
    throw new Error('usePreviewPlayer must be used inside <PreviewPlayerProvider>');
  }
  return ctx;
}
