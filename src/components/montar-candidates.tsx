'use client';

import { useMemo, useState, useTransition } from 'react';
import { suggestSetTracks } from '@/lib/actions';
import { CandidateRow } from './candidate-row';
import type { Candidate } from '@/lib/queries/montar';

type SuggestionsState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'ready';
      suggestions: Array<{ trackId: number; justificativa: string }>;
      candidatesById: Map<number, Candidate>;
    }
  | { kind: 'error'; message: string };

/**
 * Wrapper client da listagem de candidatos em `/sets/[id]/montar` (Inc 016).
 *
 * Absorve o que era o <section> "Candidatos" do RSC + o
 * <AISuggestionsPanel> antigo (que será deletado em T007). Estado
 * de sugestões fica encapsulado aqui; clicar "Sugerir com IA" chama
 * `suggestSetTracks` e re-renderiza a lista única com sugestões
 * deduplicadas no topo + candidatos comuns abaixo.
 *
 * Botões "✨ Sugerir com IA" e "Ignorar sugestões" no header.
 * Re-gerar com confirmação (Inc 14 pattern preservado).
 */
export function MontarCandidates({
  candidates,
  inSetIds,
  setId,
  aiConfigured,
  atLimit,
}: {
  candidates: Candidate[];
  inSetIds: number[];
  setId: number;
  aiConfigured: boolean;
  atLimit: boolean;
}) {
  const [state, setState] = useState<SuggestionsState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  const inSetIdsSet = useMemo(() => new Set(inSetIds), [inSetIds]);
  const isGenerating = state.kind === 'generating';
  const hasReadySuggestions =
    state.kind === 'ready' && state.suggestions.length > 0;

  // Lista derivada: dedup quando há sugestões ready
  const { suggestedCards, commonCards } = useMemo(() => {
    if (state.kind !== 'ready') {
      return {
        suggestedCards: [] as Array<{ candidate: Candidate; justificativa: string }>,
        commonCards: candidates,
      };
    }
    const suggestedIds = new Set(state.suggestions.map((s) => s.trackId));
    const suggested = state.suggestions
      .map((s) => {
        const candidate = state.candidatesById.get(s.trackId);
        return candidate
          ? { candidate, justificativa: s.justificativa }
          : null;
      })
      .filter((x): x is { candidate: Candidate; justificativa: string } => x !== null);
    const common = candidates.filter((c) => !suggestedIds.has(c.id));
    return { suggestedCards: suggested, commonCards: common };
  }, [state, candidates]);

  function handleSuggest() {
    if (hasReadySuggestions && state.kind === 'ready') {
      const ok = window.confirm(
        `Substituir as ${state.suggestions.length} sugestão(ões) atuais por uma nova lista?`,
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

  function handleIgnore() {
    setState({ kind: 'idle' });
  }

  const total = suggestedCards.length + commonCards.length;
  const counterText = hasReadySuggestions
    ? `${suggestedCards.length} sugestão(ões) IA + ${commonCards.length} outros · ${total} faixas`
    : `${total} ${total === 1 ? 'faixa' : 'faixas'} · selecionadas + ativas`;

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline pb-3 md:pb-4 border-b border-line mb-4 md:mb-6 gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif italic text-[24px] md:text-[28px] font-medium tracking-tight">
            Candidatos
          </h2>
          <span className="label-tech">{counterText}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasReadySuggestions ? (
            <button
              type="button"
              onClick={handleIgnore}
              disabled={isGenerating}
              className="font-mono text-[11px] uppercase tracking-[0.12em] border border-line hover:border-ink px-3 py-2 min-h-[44px] disabled:opacity-50 transition-colors"
            >
              Ignorar sugestões
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSuggest}
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
      </div>

      {atLimit ? (
        <div className="border border-warn/40 bg-warn/5 p-4 rounded-sm mb-6">
          <p className="font-serif italic text-ink-soft">
            Você atingiu o limite de <strong>300 faixas por set</strong>.
            Remova alguma faixa à direita para continuar adicionando.
          </p>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <p
          role="alert"
          className="font-serif italic text-[14px] text-warn bg-warn/10 border border-warn/40 px-4 py-3 mb-4"
        >
          {state.message}
        </p>
      ) : null}

      {total === 0 ? (
        <p className="font-serif italic text-ink-mute text-center py-12">
          Nenhuma faixa encontrada com esses filtros.
        </p>
      ) : (
        <ol>
          {suggestedCards.map((card) => (
            <CandidateRow
              key={`s-${card.candidate.id}`}
              candidate={card.candidate}
              setId={setId}
              alreadyIn={inSetIdsSet.has(card.candidate.id)}
              aiSuggestion={{ justificativa: card.justificativa }}
            />
          ))}
          {commonCards.map((c) => (
            <CandidateRow
              key={`c-${c.id}`}
              candidate={c}
              setId={setId}
              alreadyIn={inSetIdsSet.has(c.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
