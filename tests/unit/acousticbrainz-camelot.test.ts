import { describe, expect, it } from 'vitest';
import { toCamelot } from '@/lib/acousticbrainz/camelot';

describe('toCamelot — maior', () => {
  const cases: Array<[string, string]> = [
    ['C', '8B'],
    ['G', '9B'],
    ['D', '10B'],
    ['A', '11B'],
    ['E', '12B'],
    ['B', '1B'],
    ['F#', '2B'],
    ['C#', '3B'],
    ['G#', '4B'],
    ['D#', '5B'],
    ['A#', '6B'],
    ['F', '7B'],
  ];
  for (const [note, camelot] of cases) {
    it(`${note} major → ${camelot}`, () => {
      expect(toCamelot(note, 'major')).toBe(camelot);
    });
  }
});

describe('toCamelot — menor', () => {
  const cases: Array<[string, string]> = [
    ['C', '5A'],
    ['G', '6A'],
    ['D', '7A'],
    ['A', '8A'],
    ['E', '9A'],
    ['B', '10A'],
    ['F#', '11A'],
    ['C#', '12A'],
    ['G#', '1A'],
    ['D#', '2A'],
    ['A#', '3A'],
    ['F', '4A'],
  ];
  for (const [note, camelot] of cases) {
    it(`${note} minor → ${camelot}`, () => {
      expect(toCamelot(note, 'minor')).toBe(camelot);
    });
  }
});

describe('toCamelot — enarmônicos', () => {
  it('Db major = C# major = 3B', () => {
    expect(toCamelot('Db', 'major')).toBe('3B');
    expect(toCamelot('C#', 'major')).toBe('3B');
  });
  it('Eb minor = D# minor = 2A', () => {
    expect(toCamelot('Eb', 'minor')).toBe('2A');
    expect(toCamelot('D#', 'minor')).toBe('2A');
  });
  it('Ab minor = G# minor = 1A', () => {
    expect(toCamelot('Ab', 'minor')).toBe('1A');
    expect(toCamelot('G#', 'minor')).toBe('1A');
  });
});

describe('toCamelot — entradas inválidas', () => {
  it('null/undefined retorna null', () => {
    expect(toCamelot(null, 'major')).toBeNull();
    expect(toCamelot('C', null)).toBeNull();
    expect(toCamelot(undefined, undefined)).toBeNull();
  });
  it('nota desconhecida retorna null', () => {
    expect(toCamelot('X', 'major')).toBeNull();
  });
  it('escala desconhecida retorna null', () => {
    expect(toCamelot('C', 'lydian')).toBeNull();
  });
});
