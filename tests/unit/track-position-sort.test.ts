import { describe, expect, it } from 'vitest';
import { compareTrackPositions } from '@/lib/queries/curadoria';

function sort(positions: string[]): string[] {
  return [...positions].sort(compareTrackPositions);
}

describe('compareTrackPositions', () => {
  it('LP padrão A1, A2, B1, B2 mantém ordem', () => {
    expect(sort(['A1', 'A2', 'B1', 'B2'])).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('LP com entrada fora de ordem se normaliza', () => {
    expect(sort(['B2', 'A1', 'B1', 'A2'])).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('formato "1A, 1B, 2A, 2B" (número-primeiro) vira A1, A2, B1, B2', () => {
    expect(sort(['1A', '1B', '2A', '2B'])).toEqual(['1A', '2A', '1B', '2B']);
    // lado A antes de lado B; dentro do lado A: 1A (track 1) antes de 2A (track 2)
    // lado B idem
  });

  it('CD numérico ordena por número, não lexicográfico', () => {
    expect(sort(['1', '10', '2', '3', '11'])).toEqual(['1', '2', '3', '10', '11']);
  });

  it('medley com lado sem número (A) vem antes de A1', () => {
    expect(sort(['A1', 'A', 'A2'])).toEqual(['A', 'A1', 'A2']);
  });

  it('box set com 3 lados C/D/E ordena alfabeticamente', () => {
    expect(sort(['E1', 'C2', 'D1', 'C1', 'D2', 'E2'])).toEqual([
      'C1',
      'C2',
      'D1',
      'D2',
      'E1',
      'E2',
    ]);
  });

  it('lowercase é normalizado pra uppercase na comparação', () => {
    expect(sort(['b1', 'A2', 'a1', 'B2'])).toEqual(['a1', 'A2', 'b1', 'B2']);
    // A e a agrupam; 1 antes de 2; B e b agrupam. Ordem de string bruta
    // como tiebreaker é estável mas aqui ambos estão no mesmo side.
  });

  it('LP grande A1–A6, B1–B6 — ordem correta', () => {
    const input = ['B1', 'A3', 'A1', 'B5', 'A6', 'B2', 'A2', 'A4', 'B6', 'A5', 'B3', 'B4'];
    expect(sort(input)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'B1',
      'B2',
      'B3',
      'B4',
      'B5',
      'B6',
    ]);
  });

  it('mista de formatos (A1 + 1A) agrupa por side extraído', () => {
    // A1 e 1A extraem side=A + track=1 → tiebreak por string ASCII
    // ('1' (0x31) < 'A' (0x41)). Caso MUITO raro (um mesmo disco não
    // costuma misturar os dois formatos Discogs); asserção documenta
    // comportamento determinístico caso apareça.
    expect(sort(['A1', '1A', 'B1', '1B'])).toEqual(['1A', 'A1', '1B', 'B1']);
  });
});
