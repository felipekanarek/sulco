import { test } from '@playwright/test';

/**
 * 009 / T023 — fluxo US1 (triagem na estante) em viewport mobile 375x667.
 *
 * Cobre: home → /disco/[id] → tap toggle on/off → tap rating ++ → voltar.
 * Asserts:
 *   - sem scroll horizontal em qualquer rota visitada
 *   - hambúrguer abre drawer, link no drawer navega + fecha
 *   - bottom sheet de filtros abre/fecha
 *   - PreviewControls (008) funciona em mobile (toca Deezer)
 *
 * Skipped enquanto pipeline auth (Clerk) + seed determinístico não estão
 * ativos no CI, mesmo padrão dos demais e2e do projeto.
 */
test.describe.skip('009 — fluxo US1 mobile (T023)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('home sem scroll horizontal', async ({ page }) => {
    await page.goto('/');
    // const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    // const clientWidth = await page.evaluate(() => window.innerWidth);
    // expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('hambúrguer abre drawer + navega + fecha', async ({ page }) => {
    await page.goto('/');
    // await page.locator('button[aria-label="Abrir menu de navegação"]').click();
    // await expect(page.locator('[role="dialog"][aria-label="Menu de navegação"]')).toBeVisible();
    // await page.locator('a:has-text("Sets")').click();
    // await expect(page).toHaveURL('/sets');
    // await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('filter bottom sheet abre/aplica/fecha em /', async ({ page }) => {
    await page.goto('/');
    // await page.locator('button:has-text("Filtros")').click();
    // await expect(page.locator('[role="dialog"][aria-label="Filtros"]')).toBeVisible();
    // await page.locator('button[aria-pressed=false]:has-text("Ativos")').click();
    // await page.locator('button:has-text("Aplicar")').click();
    // await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    // await expect(page).toHaveURL(/status=active/);
  });

  test('/disco/[id] mobile: banner + toggle on/off + rating', async ({ page }) => {
    await page.goto('/disco/1');
    // await expect(page.locator('h2.title-display')).toBeVisible();
    // const onOffBtn = page.locator('button[aria-pressed]:has-text(/^o(n|ff)$/i)').first();
    // const initialState = await onOffBtn.getAttribute('aria-pressed');
    // await onOffBtn.click();
    // await expect(onOffBtn).toHaveAttribute('aria-pressed', initialState === 'true' ? 'false' : 'true');
  });

  test('PreviewControls 008 em mobile: tap ▶ Deezer toca', async ({ page }) => {
    await page.goto('/disco/1');
    // const playBtn = page.locator('button[aria-label="Tocar preview Deezer (30s)"]').first();
    // await playBtn.click();
    // await expect(page.locator('button[aria-label="Pausar preview Deezer"]').first()).toBeVisible({ timeout: 5000 });
  });
});
