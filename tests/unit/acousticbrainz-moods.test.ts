import { describe, expect, it } from 'vitest';
import { selectMoods, type ABHighLevel } from '@/lib/acousticbrainz/moods';

function payload(overrides: ABHighLevel): ABHighLevel {
  return overrides;
}

describe('selectMoods — threshold 0.7', () => {
  it('inclui moods com prob ≥ 0.7 e value === positivo', () => {
    const hl = payload({
      mood_happy: { probability: 0.9, value: 'happy' },
      mood_aggressive: { probability: 0.3, value: 'not_aggressive' },
      mood_electronic: { probability: 0.75, value: 'electronic' },
      mood_relaxed: { probability: 0.5, value: 'not_relaxed' },
      mood_acoustic: { probability: 0.95, value: 'acoustic' },
    });
    expect(selectMoods(hl)).toEqual(['acoustic', 'electronic', 'happy']);
  });

  it('exatamente 0.7 passa (≥)', () => {
    const hl = payload({
      mood_party: { probability: 0.7, value: 'party' },
    });
    expect(selectMoods(hl)).toEqual(['party']);
  });

  it('abaixo de 0.7 não passa', () => {
    const hl = payload({
      mood_party: { probability: 0.69, value: 'party' },
    });
    expect(selectMoods(hl)).toEqual([]);
  });

  it('value negativo (ex. "not_happy") não entra mesmo com prob alta', () => {
    const hl = payload({
      mood_happy: { probability: 0.95, value: 'not_happy' },
    });
    expect(selectMoods(hl)).toEqual([]);
  });
});

describe('selectMoods — filtros fixos', () => {
  it('descarta danceability e tonal_atonal mesmo com prob alta', () => {
    const hl = payload({
      danceability: { probability: 0.99, value: 'danceable' },
      tonal_atonal: { probability: 0.95, value: 'tonal' },
      mood_happy: { probability: 0.85, value: 'happy' },
    });
    expect(selectMoods(hl)).toEqual(['happy']);
  });

  it('retorna ordenado alfabeticamente', () => {
    const hl = payload({
      mood_sad: { probability: 0.9, value: 'sad' },
      mood_aggressive: { probability: 0.85, value: 'aggressive' },
      mood_happy: { probability: 0.9, value: 'happy' },
    });
    expect(selectMoods(hl)).toEqual(['aggressive', 'happy', 'sad']);
  });

  it('payload null/undefined retorna []', () => {
    expect(selectMoods(null)).toEqual([]);
    expect(selectMoods(undefined)).toEqual([]);
  });

  it('payload vazio retorna []', () => {
    expect(selectMoods({})).toEqual([]);
  });
});
