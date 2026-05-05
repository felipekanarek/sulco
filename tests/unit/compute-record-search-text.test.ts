/**
 * Inc 37 (034) Tier 3 — `computeRecordSearchText` (Inc 32 / spec 027).
 *
 * Mocks ativados: nenhum (função pura).
 *
 * Princípio coberto: VI (cobertura por camada — bullet 1).
 */
import { describe, expect, it } from 'vitest';
import { computeRecordSearchText, normalizeText } from '@/lib/text';

describe('computeRecordSearchText (Inc 32)', () => {
  describe('concatenação padrão', () => {
    it('artist + title + label normalizados', () => {
      expect(computeRecordSearchText('Sérgio Mendes', 'Brasil 66', 'A&M')).toBe(
        'sergio mendes brasil 66 a&m',
      );
    });

    it('preserva separação por espaço entre campos', () => {
      const result = computeRecordSearchText('A1', 'T1', 'L1');
      expect(result).toBe('a1 t1 l1');
      expect(result.split(' ')).toEqual(['a1', 't1', 'l1']);
    });

    it('multi-word artist preserva ordem', () => {
      expect(computeRecordSearchText('Os Mutantes', 'A E O Z do Z', 'Polydor')).toBe(
        'os mutantes a e o z do z polydor',
      );
    });
  });

  describe('label null/empty', () => {
    it('label null produz string com espaço final extra controlado', () => {
      // Implementação atual: label ?? '' → join com ' ' → "artist title "
      // Aceitamos o trailing whitespace como contrato definido.
      const result = computeRecordSearchText('A', 'T', null);
      expect(result).toBe('a t ');
      expect(result.endsWith(' ')).toBe(true);
    });

    it('label empty string idem', () => {
      const result = computeRecordSearchText('A', 'T', '');
      expect(result).toBe('a t ');
    });

    it('artist+title sem label ainda match em LIKE %sergio%', () => {
      const result = computeRecordSearchText('Sérgio', 'Som', null);
      expect(result.includes('sergio')).toBe(true);
      expect(result.includes('som')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('todos vazios + null produz string com 2 espaços', () => {
      // ['', '', ''].join(' ') === '  '
      expect(computeRecordSearchText('', '', null)).toBe('  ');
    });

    it('só artist preenchido', () => {
      expect(computeRecordSearchText('Sérgio', '', null)).toBe('sergio  ');
    });

    it('só title preenchido', () => {
      expect(computeRecordSearchText('', 'Som', null)).toBe(' som ');
    });
  });

  describe('paridade com normalizeText', () => {
    it('mesma normalização que normalizeText sobre concatenação manual', () => {
      const manual = normalizeText('Sérgio Mendes Brasil 66 A&M');
      const helper = computeRecordSearchText('Sérgio Mendes', 'Brasil 66', 'A&M');
      expect(helper).toBe(manual);
    });

    it('diacríticos preservam separação por espaço', () => {
      const result = computeRecordSearchText('Á', 'É', 'Í');
      expect(result).toBe('a e i');
    });
  });

  describe('idempotência', () => {
    it('rodar 2× com mesmos inputs produz mesma saída', () => {
      const a = computeRecordSearchText('Sérgio', 'Som', 'Polydor');
      const b = computeRecordSearchText('Sérgio', 'Som', 'Polydor');
      expect(a).toBe(b);
    });

    it('rodar normalizeText sobre output não muda nada', () => {
      const once = computeRecordSearchText('Sérgio', 'Som', 'Polydor');
      const twice = normalizeText(once);
      expect(twice).toBe(once);
    });
  });
});
