import { test, expect } from '@playwright/test';

/**
 * T056 — US2-AC1, US2-AC2, US2-AC3: triagem sequencial via teclado.
 *
 * Exige: user autenticado com ≥5 records unrated no DB.
 * Skipped até fixture de auth Clerk + seed determinístico.
 */

test.describe.skip('Curadoria sequencial — teclado (US2)', () => {
  test('US2-AC1: filtro unrated padrão; primeiro disco exibe capa, meta, tracklist, contador', async ({
    page,
  }) => {
    await page.goto('/curadoria');
    await expect(page.getByText(/de \d+/)).toBeVisible(); // contador "1 de N"
    // tracklist visível (>= 1 faixa) OU aviso de indisponibilidade
  });

  test('US2-AC2: tecla A marca Ativo e avança para o próximo disco', async ({ page }) => {
    await page.goto('/curadoria?status=unrated');
    const firstCounter = await page.locator('text=/1 de/').textContent();
    await page.keyboard.press('a');
    // espera a navegação
    await expect(page.locator('text=/2 de/')).toBeVisible();
    expect(firstCounter).not.toEqual(await page.locator('text=/2 de/').textContent());
  });

  test('US2-AC2: tecla D marca Descartado e avança', async ({ page }) => {
    await page.goto('/curadoria?status=unrated');
    await page.keyboard.press('d');
    await expect(page.locator('text=/2 de/')).toBeVisible();
  });

  test('US2-AC3: seta direita pula sem alterar status', async ({ page }) => {
    await page.goto('/curadoria?status=unrated');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('text=/2 de/')).toBeVisible();
    // Volta com seta esquerda
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('text=/1 de/')).toBeVisible();
  });

  test('US2-AC7: último disco → /curadoria/concluido', async ({ page }) => {
    // percorrer toda a lista → tela de conclusão
    // TODO: precisa de fixture com 3 records para testar linearmente
  });
});
