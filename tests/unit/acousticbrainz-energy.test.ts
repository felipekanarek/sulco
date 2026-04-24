import { describe, expect, it } from 'vitest';
import { deriveEnergy } from '@/lib/acousticbrainz/energy';

describe('deriveEnergy', () => {
  const cases: Array<[number | null | undefined, number | null]> = [
    [0.0, 1],
    [0.1, 1],
    [0.19, 1],
    [0.2, 1],
    [0.21, 2],
    [0.4, 2],
    [0.41, 3],
    [0.6, 3],
    [0.61, 4],
    [0.8, 4],
    [0.81, 5],
    [1.0, 5],
  ];
  for (const [input, expected] of cases) {
    it(`p=${input} → ${expected}`, () => {
      expect(deriveEnergy(input)).toBe(expected);
    });
  }

  it('null/undefined retorna null', () => {
    expect(deriveEnergy(null)).toBeNull();
    expect(deriveEnergy(undefined)).toBeNull();
  });

  it('valores fora do range retornam null', () => {
    expect(deriveEnergy(-0.1)).toBeNull();
    expect(deriveEnergy(1.5)).toBeNull();
  });

  it('NaN/Infinity retorna null', () => {
    expect(deriveEnergy(Number.NaN)).toBeNull();
    expect(deriveEnergy(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
