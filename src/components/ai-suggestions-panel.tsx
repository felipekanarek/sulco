'use client';

import { useState, useTransition } from 'react';
import { suggestSetTracks } from '@/lib/actions';
import { CandidateRow } from './candidate-row';
import type { Candidate } from '@/lib/queries/montar';

type AISuggestionView = {
  trackId: number;
  justificativa: string;
};

type PanelState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'ready';
      suggestions: AISuggestionView[];
      candidatesById: Map<number, Candidate>;
    }
  | { kind: 'error'; message: string };

/**
 * Painel de sugestões de IA para montagem de set (Inc 014).
 *
 * Orquestra o fluxo: clicar "✨ Sugerir com IA" → chama
 * `suggestSetTracks` → renderiza cards de sugestão (reusando
 * `<CandidateRow>` com prop `aiSuggestion`).
 *
 * Cada sugestão tem botão "Adicionar ao set" próprio (vem do
 * CandidateRow existente). Sem batch / "aplicar todas". Re-clicar
 * com sugestões pendentes pede confirmação antes de substituir.
 */
export function AISuggestionsPanel({
  setId,
  aiConfigured,
}: {
  setId: number;
  aiConfigured: boolean;
}) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  const isGenerating = state.kind === 'generating';
  const hasReadyResults = state.kind === 'ready';

  function handleGenerate() {
    // Re-gerar com confirmação se há sugestões já visíveis (FR-009)
    if (hasReadyResults && state.suggestions.length > 0) {
      const ok = window.confirm(
        `Substituir as ${state.suggestions.length} sugestão(ões) atual(ais) por uma nova lista?`,
      );
      if (!ok) return;
    }

    setState({ kind: 'generating' });
    startTransition(async () => {
      const res = await suggestSetTracks({ setId });
      if (res.ok && res.data) {
        const candidatesById = new Map(
          res.data.candidates.map((c) => [c.id, c]),
        );
        setState({
          kind: 'ready',
          suggestions: res.data.suggestions,
          candidatesById,
        });
      } else if (!res.ok) {
        setState({ kind: 'error', message: res.error });
      }
    });
  }

  return (
    <section className="mb-8 md:mb-10 pb-6 md:pb-8 border-b border-line-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-serif italic text-[20px] md:text-[24px] font-medium">
          Sugestões da IA
        </h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!aiConfigured || isGenerating}
          title={
            !aiConfigured ? 'Configure sua chave em /conta' : undefined
          }
          aria-label="Sugerir faixas com IA"
          className="font-mono text-[11px] uppercase tracking-[0.12em] border border-ink bg-ink text-paper hover:bg-paper hover:text-ink px-4 py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? 'Sugerindo…' : '✨ Sugerir com IA'}
        </button>
      </div>

      {state.kind === 'idle' ? (
        <p className="font-serif italic text-[15px] text-ink-mute md:max-w-[560px]">
          {aiConfigured
            ? 'Clique em "Sugerir com IA" para receber faixas do seu acervo que combinam com o briefing e as faixas atuais do set.'
            : 'Configure sua chave de IA em /conta para habilitar sugestões automáticas baseadas no briefing.'}
        </p>
      ) : null}

      {state.kind === 'generating' ? (
        <p className="font-serif italic text-[15px] text-ink-soft">
          Analisando briefing, faixas atuais e catálogo. Pode levar
          alguns segundos…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p
          role="alert"
          className="font-serif italic text-[14px] text-warn bg-warn/10 border border-warn/40 px-4 py-3"
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === 'ready' ? (
        state.suggestions.length === 0 ? (
          <p className="font-serif italic text-[15px] text-ink-mute">
            Nenhuma sugestão válida — tente outra geração ou ajuste
            os filtros.
          </p>
        ) : (
          <div className="flex flex-col">
            {state.suggestions.map((s) => {
              const candidate = state.candidatesById.get(s.trackId);
              if (!candidate) return null;
              return (
                <CandidateRow
                  key={s.trackId}
                  candidate={candidate}
                  setId={setId}
                  alreadyIn={false}
                  aiSuggestion={{ justificativa: s.justificativa }}
                />
              );
            })}
          </div>
        )
      ) : null}
    </section>
  );
}
