import { test } from '@playwright/test';

/**
 * 008 / T021 — preview inline em /sets/[id]/montar (US2).
 * Cobre cenário "click ▶ + click ▶ outra → primeira pausa" via Context global.
 *
 * Skipped enquanto pipeline Clerk + seed determinístico de candidatos
 * não está ativo (mesmo padrão dos demais e2e de US2 do projeto).
 * Estrutura mínima pra ativação futura:
 */
test.describe.skip('Preview de áudio na montagem (008/US2)', () => {
  test('▶ candidata 1, depois ▶ candidata 2 → 1 pausa', async ({ page }) => {
    await page.goto('/sets/1/montar');
    // TODO: aplicar filtros pra trazer candidatas conhecidas (Spoon etc.)
    // await page.locator('[data-track-id="A"] button[aria-label="Tocar preview Deezer (30s)"]').click();
    // await expect(page.locator('[data-track-id="A"] button[aria-label="Pausar preview Deezer"]')).toBeVisible();
    // await page.locator('[data-track-id="B"] button[aria-label="Tocar preview Deezer (30s)"]').click();
    // await expect(page.locator('[data-track-id="A"] button[aria-label="Tocar preview Deezer (30s)"]')).toBeVisible();
    // await expect(page.locator('[data-track-id="B"] button[aria-label="Pausar preview Deezer"]')).toBeVisible();
  });

  test('+ adicionar à bag NÃO interrompe preview tocando', async ({ page }) => {
    await page.goto('/sets/1/montar');
    // TODO: ▶ candidata, click +, asserta que botão segue em ⏸ (playing)
  });

  test('Spotify e YouTube link-out abrem nova aba', async ({ page }) => {
    await page.goto('/sets/1/montar');
    // TODO: assertar href + target=_blank em cada candidata
  });
});
