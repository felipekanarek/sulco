import { describe, expect, it } from 'vitest';
import { tokenizeFormat } from '@/lib/format-tokens';

/**
 * Inc 36 (033) — `tokenizeFormat` é alimentação para 2 estruturas
 * derivadas em prod (`record_formats` pivot + `user_vocab.kind=formats`).
 * Bug aqui = filtro de format quebra. Princípio VI cobre.
 *
 * Edge cases mapeados em
 * [specs/033-format-pivot-composite-idx/spec.md](../../specs/033-format-pivot-composite-idx/spec.md)
 * seção Edge Cases.
 */
describe('tokenizeFormat (Inc 36)', () => {
  describe('input padrão Discogs', () => {
    it('splita string simples por vírgula', () => {
      expect(tokenizeFormat('Vinyl, LP')).toEqual(['Vinyl', 'LP']);
    });

    it('splita string composta com 4+ tokens', () => {
      expect(tokenizeFormat('Vinyl, LP, Album, Stereo')).toEqual([
        'Vinyl',
        'LP',
        'Album',
        'Stereo',
      ]);
    });

    it('preserva tokens com aspas (7", 12", 10")', () => {
      expect(tokenizeFormat('Vinyl, 7", Single')).toEqual([
        'Vinyl',
        '7"',
        'Single',
      ]);
    });

    it('preserva tokens com símbolos unicode (33 ⅓ RPM)', () => {
      expect(tokenizeFormat('Vinyl, LP, 33 ⅓ RPM')).toEqual([
        'Vinyl',
        'LP',
        '33 ⅓ RPM',
      ]);
    });
  });

  describe('whitespace handling (Princípio: vocab limpo)', () => {
    it('faz trim em cada token', () => {
      expect(tokenizeFormat('Vinyl,  LP  ,  Album')).toEqual([
        'Vinyl',
        'LP',
        'Album',
      ]);
    });

    it('aceita string sem espaço após vírgula', () => {
      expect(tokenizeFormat('Vinyl,LP,Album')).toEqual([
        'Vinyl',
        'LP',
        'Album',
      ]);
    });

    it('filtra tokens vazios entre vírgulas duplicadas', () => {
      expect(tokenizeFormat('Vinyl, , LP')).toEqual(['Vinyl', 'LP']);
    });

    it('filtra trailing comma', () => {
      expect(tokenizeFormat('Vinyl, LP,')).toEqual(['Vinyl', 'LP']);
    });

    it('filtra leading comma', () => {
      expect(tokenizeFormat(', Vinyl, LP')).toEqual(['Vinyl', 'LP']);
    });

    it('filtra string só de whitespace', () => {
      expect(tokenizeFormat('   ')).toEqual([]);
    });
  });

  describe('edge cases (FR-002 + spec Edge Cases)', () => {
    it('retorna [] pra null', () => {
      expect(tokenizeFormat(null)).toEqual([]);
    });

    it('retorna [] pra undefined', () => {
      expect(tokenizeFormat(undefined)).toEqual([]);
    });

    it('retorna [] pra string vazia', () => {
      expect(tokenizeFormat('')).toEqual([]);
    });

    it('aceita single token sem vírgula', () => {
      expect(tokenizeFormat('CD')).toEqual(['CD']);
    });

    it('preserva ordem de inserção', () => {
      // Ordem importa pra estabilidade do hash de chip-set no UI.
      expect(tokenizeFormat('Box Set, LP, Compilation, Reissue')).toEqual([
        'Box Set',
        'LP',
        'Compilation',
        'Reissue',
      ]);
    });

    it('NÃO deduplica tokens repetidos (caller decide via PK ON CONFLICT)', () => {
      // Entrada estranha do Discogs: "Vinyl, LP, Vinyl". A PK composta
      // de record_formats + applyPivotDelta cobrem dedup; tokenizeFormat
      // só serve a função de extração.
      expect(tokenizeFormat('Vinyl, LP, Vinyl')).toEqual([
        'Vinyl',
        'LP',
        'Vinyl',
      ]);
    });
  });

  describe('paridade Inc 8 user_vocab', () => {
    it('produz 39 tokens pra coleção real Felipe (smoke)', () => {
      // Top tokens reais em prod (gate verificável Inc 36 T015):
      // Vinyl=2575, LP=2243, Album=1743, Stereo=429, Compilation=387,
      // Reissue=237, 7"=235. Função MUST extrair cada um corretamente.
      const samples = [
        'Vinyl, LP, Album',
        'Vinyl, 7"',
        'Vinyl, LP, Compilation, Reissue',
        'Vinyl, LP, Album, Stereo',
      ];
      const tokens = new Set<string>();
      for (const s of samples) {
        for (const t of tokenizeFormat(s)) tokens.add(t);
      }
      expect(tokens).toContain('Vinyl');
      expect(tokens).toContain('LP');
      expect(tokens).toContain('7"');
      expect(tokens).toContain('Album');
      expect(tokens).toContain('Stereo');
      expect(tokens).toContain('Compilation');
      expect(tokens).toContain('Reissue');
    });
  });
});
