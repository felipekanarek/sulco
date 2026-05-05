/**
 * Inc 37 (034) Tier 3 — `diffVocabArrays` (Inc 33 / spec 028).
 *
 * Mocks ativados: nenhum (função pura).
 *
 * Princípio coberto: VI (cobertura por camada — bullet 1).
 */
import { describe, expect, it } from 'vitest';
import { diffVocabArrays } from '@/lib/queries/user-vocab';

describe('diffVocabArrays (Inc 33)', () => {
  describe('added/removed disjuntos', () => {
    it('detecta only-add (old vazio, new com items)', () => {
      const r = diffVocabArrays([], ['Funk', 'Soul']);
      expect(r.added).toEqual(['Funk', 'Soul']);
      expect(r.removed).toEqual([]);
    });

    it('detecta only-remove (old com items, new vazio)', () => {
      const r = diffVocabArrays(['Funk', 'Soul'], []);
      expect(r.added).toEqual([]);
      expect(r.removed).toEqual(['Funk', 'Soul']);
    });

    it('detecta misto add + remove na mesma chamada', () => {
      const r = diffVocabArrays(['Funk', 'Jazz'], ['Funk', 'Soul']);
      expect(r.added).toEqual(['Soul']);
      expect(r.removed).toEqual(['Jazz']);
    });

    it('completo replacement (zero overlap)', () => {
      const r = diffVocabArrays(['A', 'B'], ['C', 'D']);
      expect(r.added).toEqual(['C', 'D']);
      expect(r.removed).toEqual(['A', 'B']);
    });
  });

  describe('arrays idênticos', () => {
    it('retorna {added:[], removed:[]} pra arrays iguais', () => {
      const r = diffVocabArrays(['Funk', 'Soul'], ['Funk', 'Soul']);
      expect(r.added).toEqual([]);
      expect(r.removed).toEqual([]);
    });

    it('ordem diferente mas mesmo conteúdo é no-op', () => {
      const r = diffVocabArrays(['Funk', 'Soul'], ['Soul', 'Funk']);
      expect(r.added).toEqual([]);
      expect(r.removed).toEqual([]);
    });
  });

  describe('ordem preservada', () => {
    it('added respeita ordem do new array', () => {
      const r = diffVocabArrays([], ['C', 'A', 'B']);
      expect(r.added).toEqual(['C', 'A', 'B']);
    });

    it('removed respeita ordem do old array', () => {
      const r = diffVocabArrays(['C', 'A', 'B'], []);
      expect(r.removed).toEqual(['C', 'A', 'B']);
    });
  });

  describe('edge cases', () => {
    it('ambos vazios retorna estrutura vazia', () => {
      const r = diffVocabArrays([], []);
      expect(r.added).toEqual([]);
      expect(r.removed).toEqual([]);
    });

    it('duplicatas em new produzem multiplas entries em added (semântica atual)', () => {
      // diffVocabArrays usa filter (não Set) no lado de saída — duplicatas
      // são preservadas. Caller (applyVocabDelta) faz dedup via UPSERT.
      const r = diffVocabArrays([], ['Funk', 'Funk']);
      expect(r.added).toEqual(['Funk', 'Funk']);
    });

    it('duplicatas em old produzem multiplas entries em removed', () => {
      const r = diffVocabArrays(['Funk', 'Funk'], []);
      expect(r.removed).toEqual(['Funk', 'Funk']);
    });

    it('case-sensitive: "Funk" ≠ "funk"', () => {
      const r = diffVocabArrays(['Funk'], ['funk']);
      expect(r.added).toEqual(['funk']);
      expect(r.removed).toEqual(['Funk']);
    });

    it('preserva strings vazias se presentes (caller filtra)', () => {
      const r = diffVocabArrays(['', 'Funk'], ['Funk']);
      expect(r.removed).toContain('');
    });
  });
});
