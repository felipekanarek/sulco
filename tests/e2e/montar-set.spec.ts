import { test } from '@playwright/test';

/**
 * T084 — US3-AC3..AC6: fluxo completo de montagem.
 */
test.describe.skip('Montar set (US3)', () => {
  test('US3-AC3: add → some dos candidatos, aparece no painel direito', () => {
    // TODO
  });
  test('US3-AC4: abrir /sets/[id] após adicionar → vê lista ordenada + bag com 💣 nos discos que têm Bomba', () => {
    // TODO
  });
  test('US3-AC5: filtros AND em moods — 2 moods mostra só faixas com ambos', () => {
    // TODO
  });
  test('US3-AC6: reordenar via teclado (handle focus, setas, espaço) persiste a ordem', () => {
    // TODO
  });
  test('FR-029a: adicionar 301ª faixa falha com mensagem de limite', () => {
    // TODO
  });
});
