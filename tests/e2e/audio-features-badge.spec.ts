import { test } from '@playwright/test';

/**
 * T026 (005-acousticbrainz-audio-features, US2, FR-011) — badge visual
 * "sugestão · acousticbrainz" aparece apenas em tracks com
 * `audioFeaturesSource = 'acousticbrainz'`; não aparece em 'manual'
 * nem em null.
 *
 * Fixture esperada: record com 3 tracks selected=true —
 *   (1) source='acousticbrainz' → badge VISÍVEL
 *   (2) source='manual'         → badge AUSENTE
 *   (3) source=null (vazia)     → badge AUSENTE
 *
 * Skipped enquanto pipeline Clerk + seed determinístico não está ativo
 * (mesmo padrão dos e2e de US2 do incremento 001).
 */
test.describe.skip('Audio features badge (US2)', () => {
  test('badge aparece apenas quando audioFeaturesSource=acousticbrainz', async ({ page }) => {
    await page.goto('/disco/1');
    // TODO: fixture de 3 tracks com sources diferentes
    // expect(page.locator('[data-audio-features-source="acousticbrainz"]')).toHaveCount(1);
    // expect(page.locator('[data-audio-features-source="manual"]')).toHaveCount(0);
    // (track null não tem atributo algum)
  });

  test('ao editar bpm via inline input, badge desaparece (source vira manual)', async ({ page }) => {
    await page.goto('/disco/1');
    // TODO: selecionar input bpm da track sugerida, alterar, blur,
    // esperar revalidate e confirmar que badge sumiu.
  });

  test('ao limpar campo sugerido (bpm=null), badge desaparece e bpm fica vazio', async ({ page }) => {
    await page.goto('/disco/1');
    // TODO: limpar campo bpm, confirmar que badge some e bpm exibe vazio.
  });
});
