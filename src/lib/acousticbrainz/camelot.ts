import 'server-only';

// Conversão key+scale (AcousticBrainz) → notação Camelot (1A..12A / 1B..12B)
// usada em tracks.musicalKey (FR-017b do piloto 001).
// Tabela: research.md §3.

type Scale = 'major' | 'minor';

// Chave canônica (sem enarmônicos) → Camelot
const MAJOR_TO_CAMELOT: Record<string, string> = {
  C: '8B',
  'C#': '3B',
  Db: '3B',
  D: '10B',
  'D#': '5B',
  Eb: '5B',
  E: '12B',
  F: '7B',
  'F#': '2B',
  Gb: '2B',
  G: '9B',
  'G#': '4B',
  Ab: '4B',
  A: '11B',
  'A#': '6B',
  Bb: '6B',
  B: '1B',
};

const MINOR_TO_CAMELOT: Record<string, string> = {
  C: '5A',
  'C#': '12A',
  Db: '12A',
  D: '7A',
  'D#': '2A',
  Eb: '2A',
  E: '9A',
  F: '4A',
  'F#': '11A',
  Gb: '11A',
  G: '6A',
  'G#': '1A',
  Ab: '1A',
  A: '8A',
  'A#': '3A',
  Bb: '3A',
  B: '10A',
};

/**
 * Converte nota + escala do AcousticBrainz (ex: "C", "major") pra
 * notação Camelot (ex: "8B"). Retorna `null` se entrada inválida.
 *
 * Aceita enarmônicos (`C#`/`Db`, `Eb`/`D#`, etc.) — ambos mapeiam pra
 * mesmo valor. Entrada é case-sensitive pra nota (AB retorna uppercase).
 */
export function toCamelot(keyKey: string | null | undefined, keyScale: Scale | string | null | undefined): string | null {
  if (!keyKey || !keyScale) return null;

  const normalized = keyKey.trim();
  if (keyScale === 'major') {
    return MAJOR_TO_CAMELOT[normalized] ?? null;
  }
  if (keyScale === 'minor') {
    return MINOR_TO_CAMELOT[normalized] ?? null;
  }
  return null;
}
