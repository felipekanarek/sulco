import { test, expect } from '@playwright/test';

/**
 * US1-AC1/AC2 — Onboarding caminho feliz.
 *
 * NOTA: Este teste exige Clerk real + um PAT Discogs real. Rode manualmente
 * com `npm run test:e2e -- tests/e2e/onboarding.spec.ts` após configurar as
 * chaves Clerk e fazer signup.
 *
 * Para CI: pular ou usar Clerk development instance com user pré-criado.
 */

test.describe.skip('Onboarding (US1)', () => {
  test('US1-AC1: visitante é redirecionado para /sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('US1-AC2: após signup + PAT válido, inicia import e volta para /', async ({ page }) => {
    // TODO: configurar Clerk fixtures e Discogs fixture.
    // 1. Navegar até /sign-up
    // 2. Preencher email/senha (ou Google no E2E)
    // 3. Esperar redirect para /onboarding
    // 4. Preencher discogsUsername + PAT válido
    // 5. Clicar "Conectar e importar coleção"
    // 6. Assert toHaveURL('/')
    // 7. Assert que a página mostra "Olá, <email>" (placeholder atual)
    //    ou que o componente <ImportProgress> aparece (quando T036..T040 forem implementadas)
  });
});
