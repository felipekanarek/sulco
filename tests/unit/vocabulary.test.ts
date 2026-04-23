import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTEXT_SEEDS,
  DEFAULT_MOOD_SEEDS,
  buildSuggestionList,
  normalizeVocabTerm,
} from '@/lib/vocabulary';

describe('vocabulary — FR-017a', () => {
  it('normalizeVocabTerm faz trim + lowercase', () => {
    expect(normalizeVocabTerm('  Solar ')).toBe('solar');
    expect(normalizeVocabTerm('FESTIVO')).toBe('festivo');
    expect(normalizeVocabTerm('Etéreo')).toBe('etéreo');
  });

  it('conta sementes de mood e contexto conforme acordado em CHK055', () => {
    expect(DEFAULT_MOOD_SEEDS.length).toBe(10);
    expect(DEFAULT_CONTEXT_SEEDS.length).toBe(8);
  });

  it('buildSuggestionList dá prioridade ao DJ por frequência desc, depois sementes alfa', () => {
    const userTerms = [
      { term: 'hipnótico', count: 3 },
      { term: 'cru', count: 10 },
      { term: 'solar', count: 1 },
    ];
    const out = buildSuggestionList(userTerms, DEFAULT_MOOD_SEEDS);
    // Primeiros 3 = termos do DJ por count desc
    expect(out.slice(0, 3)).toEqual(['cru', 'hipnótico', 'solar']);
    // Seguintes = sementes alfa sem dup
    const rest = out.slice(3);
    const expectedRest = DEFAULT_MOOD_SEEDS.map(normalizeVocabTerm)
      .filter((s) => !['cru', 'hipnótico', 'solar'].includes(s))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    expect(rest).toEqual(expectedRest);
  });

  it('dedup case-insensitive entre termos do DJ e sementes', () => {
    const userTerms = [{ term: 'SOLAR', count: 5 }];
    const out = buildSuggestionList(userTerms, ['solar', 'festivo']);
    // 'solar' aparece apenas 1x
    expect(out.filter((t) => t === 'solar').length).toBe(1);
  });

  it('lista vazia do DJ retorna apenas sementes em ordem alfa', () => {
    const out = buildSuggestionList([], ['festivo', 'solar', 'cru']);
    expect(out).toEqual(['cru', 'festivo', 'solar']);
  });
});
