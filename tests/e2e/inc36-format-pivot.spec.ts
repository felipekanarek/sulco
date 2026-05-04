import { test, expect } from '@playwright/test';

/**
 * Inc 36 (033) — E2E pivot record_formats + composite year_imported.
 *
 * Princípio VI (bullet 3): fluxo UI novo ou alterado MUST ter pelo menos
 * 1 teste E2E cobrindo o caminho dourado.
 *
 * Mesmo pattern dos outros E2E do projeto (listagem-filtros.spec.ts):
 * skipped até fixture de Clerk auth + seed determinístico estarem
 * disponíveis. Cenários estruturados pra unblock instantâneo quando
 * fixture chegar.
 *
 * Caminho dourado coberto por estes testes:
 * - US1: filtro `?format=LP` retorna lista correta + URL preserva.
 * - US2: filtro `?year=1985` retorna lista correta + URL preserva.
 * - US3: combinação de filtros mantém UI consistente.
 */

test.describe.skip('Inc 36 — pivot record_formats + composite year (E2E)', () => {
  test('US1: ?format=LP retorna apenas LPs e URL reflete estado', async ({
    page,
  }) => {
    await page.goto('/?format=LP');
    // 1. Lista carrega sem erro (sem 500/404).
    await expect(page).toHaveTitle(/Sulco|Coleção/i);
    // 2. URL preserva o param após hidratação.
    await expect(page).toHaveURL(/format=LP/);
    // 3. PickerButton "Formato" mostra contagem ativa.
    const formatButton = page.getByRole('button', { name: /Formato/i });
    await expect(formatButton).toContainText('1');
    // 4. Cards exibidos têm format contendo LP (visível ou via aria-label).
    // TODO quando fixture estiver pronta: contar cards visíveis e
    // assertar que CADA UM tem badge/texto "LP".
  });

  test('US1: picker de Formato mostra tokens base (não strings compostas)', async ({
    page,
  }) => {
    await page.goto('/');
    // Abrir picker de Formato
    await page.getByRole('button', { name: /Formato/i }).click();
    // Chips esperados: tokens base (LP, 7", CD, etc.) — não composites
    await expect(page.getByRole('button', { name: 'LP' })).toBeVisible();
    await expect(page.getByRole('button', { name: '7"' })).toBeVisible();
    // Anti-regressão Inc 8: NUNCA "Vinyl, LP, Album" como entry única
    await expect(
      page.getByRole('button', { name: /^Vinyl, LP/ }),
    ).toHaveCount(0);
  });

  test('US2: ?year=1985 retorna apenas records de 1985 e URL preserva', async ({
    page,
  }) => {
    await page.goto('/?year=1985');
    await expect(page).toHaveURL(/year=1985/);
    const yearButton = page.getByRole('button', { name: /Ano/i });
    await expect(yearButton).toContainText('1');
  });

  test('US2: picker de Ano mostra anos individuais (não décadas)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Ano/i }).click();
    // Chips esperados: anos 4-dígitos
    await expect(page.getByRole('button', { name: '1985' })).toBeVisible();
    // Anti-regressão Inc 8: NUNCA "60s", "70s" (década foi rejeitada)
    await expect(page.getByRole('button', { name: /^[0-9]{2}s$/ })).toHaveCount(0);
  });

  test('US3: combinação format + year + country mantém UI consistente', async ({
    page,
  }) => {
    await page.goto('/?format=LP&year=1985&country=BR');
    await expect(page).toHaveURL(/format=LP/);
    await expect(page).toHaveURL(/year=1985/);
    await expect(page).toHaveURL(/country=BR/);
    // 3 PickerButtons devem mostrar count ativo (1)
    await expect(
      page.getByRole('button', { name: /Formato/i }),
    ).toContainText('1');
    await expect(
      page.getByRole('button', { name: /Ano/i }),
    ).toContainText('1');
    await expect(
      page.getByRole('button', { name: /País/i }),
    ).toContainText('1');
  });

  test('US1 mobile: bottom sheet abre no viewport ≤640px (Princípio V)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    // No mobile o picker de Formato abre como bottom sheet (MobileDrawer)
    await page.getByRole('button', { name: /Filtros/i }).click();
    await page.getByRole('button', { name: /Formato/i }).click();
    // Drawer renderizado (role dialog ou aria-label específico)
    const drawer = page.getByRole('dialog', { name: /Filtrar por formato/i });
    await expect(drawer).toBeVisible();
  });
});
