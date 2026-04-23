import { test } from '@playwright/test';

/**
 * T065 — US2-AC4..AC6: curadoria de faixas em /disco/[id].
 *
 * Exige fixture de user autenticado + record com tracks. Skipped até
 * pipeline de Clerk + seed determinístico estar pronto.
 */
test.describe.skip('Curadoria de faixas (US2)', () => {
  test('US2-AC4: marcar selected revela campos (BPM, Camelot, energy, moods, contexts, rating, Bomba)', () => {
    // TODO
  });
  test('US2-AC5: toggle Bomba faz 💣 aparecer imediatamente no cabeçalho da faixa', () => {
    // TODO
  });
  test('US2-AC6: desmarcar selected esconde campos mas preserva valores; remarcar os traz de volta', () => {
    // TODO
  });
  test('BPM fora do range [0,250] é rejeitado com mensagem', () => {
    // TODO
  });
  test('Camelot em notação tradicional (Am) é rejeitado; wheel aceita 8A', () => {
    // TODO
  });
  test('ChipPicker normaliza trim+lowercase e dedup case-insensitive', () => {
    // TODO
  });
});
