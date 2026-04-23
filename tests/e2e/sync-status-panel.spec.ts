import { test } from '@playwright/test';

/**
 * T102 — US4-AC2, AC4, AC6: painel de sincronização em ação.
 */
test.describe.skip('Painel /status (US4)', () => {
  test('US4-AC2: sync detecta remoção → disco arquivado + banner + entrada em /status', () => {
    // TODO: simular /api/cron + depois acessar /status
  });
  test('US4-AC4: faixa em conflito oferece "Manter no Sulco" e "Descartar" (com confirmação)', () => {
    // TODO
  });
  test('US4-AC6: rate limit pausa sync e cria syncRun com outcome=rate_limited visível em /status', () => {
    // TODO
  });
  test('FR-041: visitar /status zera `lastStatusVisitAt` e remove badge do header', () => {
    // TODO
  });
  test('FR-036: acknowledge remove item do banner sem apagar dados autorais', () => {
    // TODO
  });
});
