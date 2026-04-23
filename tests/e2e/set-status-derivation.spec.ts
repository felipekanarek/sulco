import { test } from '@playwright/test';

/**
 * T085 — US3-AC7: transição automática do status por eventDate.
 * Status é derivado em runtime (FR-028) — nenhum cron envolvido.
 */
test.describe.skip('Status derivado do Set (US3-AC7)', () => {
  test('eventDate vazio → "Rascunho"', () => {
    // TODO
  });
  test('eventDate no futuro → "Agendado"', () => {
    // TODO
  });
  test('eventDate no passado → "Realizado" (sem intervenção do DJ)', () => {
    // TODO
  });
  test('ajustar eventDate de futuro para passado → status muda para Realizado imediatamente', () => {
    // TODO
  });
});
