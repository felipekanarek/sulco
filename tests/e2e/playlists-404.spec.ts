import { test, expect } from '@playwright/test';

/**
 * T112 — FR-053a: playlists fora de escopo; middleware retorna 404.
 */
test('/playlists retorna 404', async ({ page }) => {
  const res = await page.goto('/playlists');
  expect(res?.status()).toBe(404);
});

test('/playlists/novo retorna 404', async ({ page }) => {
  const res = await page.goto('/playlists/novo');
  expect(res?.status()).toBe(404);
});

test('/playlists/123 retorna 404', async ({ page }) => {
  const res = await page.goto('/playlists/123');
  expect(res?.status()).toBe(404);
});
