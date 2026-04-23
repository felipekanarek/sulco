import { test, expect } from '@playwright/test';

/**
 * T047 — US1-AC3, US1-AC4: listagem com filtros combinados.
 *
 * Exige: usuário autenticado + fixture de seed com variedade de discos
 * (status unrated/active/discarded, gêneros diversos, ≥1 faixa Bomba).
 * Skipped até fixture de Clerk auth + seed determinístico.
 */

test.describe.skip('Listagem com filtros (US1)', () => {
  test('US1-AC3: renderiza grid com capa + metadata + shelfLocation', async ({ page }) => {
    await page.goto('/');
    // TODO: assertions sobre cards, cover, badge de status etc.
  });

  test('US1-AC4 status: filtro `active` oculta unrated', async ({ page }) => {
    await page.goto('/?status=active');
    // TODO: assert que todos os cards visíveis têm badge "Active"
  });

  test('US1-AC4 gêneros AND: dois gêneros juntos só mostram interseção', async ({ page }) => {
    await page.goto('/?genre=Jazz&genre=Funk');
    // TODO: assert que nenhum card tem só um dos dois
  });

  test('US1-AC4 Bomba tri-estado: only → apenas discos com Bomba', async ({ page }) => {
    await page.goto('/?bomba=only');
    // TODO: assert que cada card exibe 💣 e sem 💣 → 0 resultados
  });

  test('US1-AC4 texto livre: filtra por artista', async ({ page }) => {
    await page.goto('/?q=Floating');
    // TODO: assert que artistas exibidos contêm "Floating"
  });
});
