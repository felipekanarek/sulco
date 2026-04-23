import { test, expect } from '@playwright/test';

/**
 * FR-051 — Mensagens de erro específicas no onboarding (US1).
 *
 * Exige: usuário já autenticado e middleware redirecionando para /onboarding.
 * A lógica de cada erro está em `saveDiscogsCredential` (T032).
 *
 * Estratégia: intercept `fetch` para `api.discogs.com` e forjar respostas por
 * cenário (401, 404, 200 com coleção vazia, timeout, 500).
 *
 * NOTA: Skipped até fixture de auth + helper de intercept estarem prontos.
 */

test.describe.skip('Onboarding — erros por ponto de falha (FR-051)', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: autenticar user via API da Clerk
    await page.goto('/onboarding');
  });

  test('FR-051(a) PAT rejeitado (401)', async ({ page }) => {
    await page.route('**/api.discogs.com/**', (route) =>
      route.fulfill({ status: 401, body: 'Unauthorized' }),
    );
    await page.getByLabel('Username do Discogs').fill('felipekanarek');
    await page.getByLabel('Personal Access Token').fill('abc_invalid_pat_1234567890');
    await page.getByRole('button', { name: /Conectar/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Token inválido/i);
  });

  test('FR-051(b) usuário Discogs inexistente (404)', async ({ page }) => {
    await page.route('**/users/fantasma/collection/**', (route) =>
      route.fulfill({ status: 404, body: 'Not Found' }),
    );
    await page.getByLabel('Username do Discogs').fill('fantasma');
    await page.getByLabel('Personal Access Token').fill('valid_pat_1234567890abc');
    await page.getByRole('button', { name: /Conectar/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Usuário Discogs não encontrado/i);
  });

  test('FR-051(c) coleção vazia', async ({ page }) => {
    await page.route('**/collection/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pagination: { page: 1, pages: 0, per_page: 1, items: 0 },
          releases: [],
        }),
      }),
    );
    await page.getByLabel('Username do Discogs').fill('semdiscos');
    await page.getByLabel('Personal Access Token').fill('valid_pat_1234567890abc');
    await page.getByRole('button', { name: /Conectar/i }).click();
    await expect(page.getByRole('alert')).toContainText(/não tem discos na coleção/i);
  });

  test('FR-051(d) Discogs fora do ar (500)', async ({ page }) => {
    await page.route('**/api.discogs.com/**', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );
    await page.getByLabel('Username do Discogs').fill('felipekanarek');
    await page.getByLabel('Personal Access Token').fill('valid_pat_1234567890abc');
    await page.getByRole('button', { name: /Conectar/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Não foi possível falar com o Discogs/i);
  });

  test('FR-051(e) rate limit 429', async ({ page }) => {
    await page.route('**/api.discogs.com/**', (route) =>
      route.fulfill({ status: 429, body: 'Too Many Requests' }),
    );
    await page.getByLabel('Username do Discogs').fill('felipekanarek');
    await page.getByLabel('Personal Access Token').fill('valid_pat_1234567890abc');
    await page.getByRole('button', { name: /Conectar/i }).click();
    await expect(page.getByRole('alert')).toContainText(/limitando a taxa/i);
  });
});
