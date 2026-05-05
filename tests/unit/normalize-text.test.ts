/**
 * Inc 37 (034) Tier 3 — `normalizeText` (Inc 18 / spec 021).
 *
 * Mocks ativados: nenhum (função pura, sem dependências externas).
 *
 * Princípio coberto: VI (cobertura de testes por camada — bullet 1).
 */
import { describe, expect, it } from 'vitest';
import { normalizeText, matchesNormalizedText } from '@/lib/text';

describe('normalizeText (Inc 18) — accent + case insensitive', () => {
  describe('diacríticos pt-BR', () => {
    it('remove acentos agudos', () => {
      expect(normalizeText('Sérgio')).toBe('sergio');
      expect(normalizeText('café')).toBe('cafe');
    });

    it('remove acento circunflexo', () => {
      expect(normalizeText('âncora')).toBe('ancora');
      expect(normalizeText('três')).toBe('tres');
    });

    it('remove til', () => {
      expect(normalizeText('São Paulo')).toBe('sao paulo');
      expect(normalizeText('coração')).toBe('coracao');
    });

    it('remove cedilha', () => {
      expect(normalizeText('Açúcar')).toBe('acucar');
      expect(normalizeText('garçon')).toBe('garcon');
    });

    it('remove acento grave', () => {
      expect(normalizeText('à')).toBe('a');
    });
  });

  describe('Unicode universal (não só pt-BR)', () => {
    it('francês', () => {
      expect(normalizeText('naïve')).toBe('naive');
      expect(normalizeText('hôtel')).toBe('hotel');
    });

    it('alemão', () => {
      // ü decompõe pra u + diacrítico (NFD remove)
      expect(normalizeText('über')).toBe('uber');
    });

    it('vietnamita (múltiplos diacríticos)', () => {
      expect(normalizeText('Việt')).toBe('viet');
    });
  });

  describe('case-insensitive', () => {
    it('lowercase entrada maiúscula', () => {
      expect(normalizeText('SAMBA')).toBe('samba');
    });

    it('lowercase entrada mista', () => {
      expect(normalizeText('SãO PaUlO')).toBe('sao paulo');
    });
  });

  describe('idempotência (bidirecional)', () => {
    it('entrada já normalizada continua normalizada', () => {
      expect(normalizeText('sao paulo')).toBe('sao paulo');
      expect(normalizeText('garcon')).toBe('garcon');
    });

    it('rodar 2× produz mesmo resultado', () => {
      const once = normalizeText('São Paulo');
      const twice = normalizeText(once);
      expect(twice).toBe(once);
    });
  });

  describe('edge cases', () => {
    it('retorna string vazia pra null', () => {
      expect(normalizeText(null)).toBe('');
    });

    it('retorna string vazia pra undefined', () => {
      expect(normalizeText(undefined)).toBe('');
    });

    it('retorna string vazia pra empty', () => {
      expect(normalizeText('')).toBe('');
    });

    it('preserva whitespace interno', () => {
      expect(normalizeText('  Sérgio  Mendes  ')).toBe('  sergio  mendes  ');
    });

    it('preserva números', () => {
      expect(normalizeText('1985 Bossa')).toBe('1985 bossa');
    });

    it('preserva pontuação', () => {
      expect(normalizeText("Bossa: O Som")).toBe('bossa: o som');
    });

    it('preserva emojis (não tem combining marks)', () => {
      expect(normalizeText('Açaí 🍇')).toBe('acai 🍇');
    });
  });
});

describe('matchesNormalizedText (Inc 18) — busca em haystacks', () => {
  it('retorna true quando query normalizada matches haystack normalizado', () => {
    expect(matchesNormalizedText(['São Paulo'], 'sao paulo')).toBe(true);
  });

  it('retorna true bidirecionalmente (query com acento, haystack sem)', () => {
    expect(matchesNormalizedText(['sao paulo'], 'São Paulo')).toBe(true);
  });

  it('retorna false sem match em nenhum haystack', () => {
    expect(matchesNormalizedText(['Rio'], 'paulo')).toBe(false);
  });

  it('retorna true pra query vazia (caller filtra)', () => {
    expect(matchesNormalizedText(['qualquer'], '')).toBe(true);
  });

  it('retorna true pra query whitespace-only', () => {
    expect(matchesNormalizedText(['qualquer'], '   ')).toBe(true);
  });

  it('null/undefined em haystacks não quebram', () => {
    expect(matchesNormalizedText([null, undefined, 'São Paulo'], 'sao')).toBe(true);
    expect(matchesNormalizedText([null, undefined], 'sao')).toBe(false);
  });

  it('substring match funciona', () => {
    expect(matchesNormalizedText(['Sérgio Mendes'], 'mend')).toBe(true);
  });
});
