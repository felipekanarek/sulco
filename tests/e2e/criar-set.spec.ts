import { test } from '@playwright/test';

/**
 * T083 — US3-AC1..AC2: criar set + redirect para montagem.
 *
 * Exige fixture Clerk + pelo menos alguns records para não ter candidatos zero.
 * Skipped até fixture pronta.
 */
test.describe.skip('Criar set (US3)', () => {
  test('US3-AC1: /sets/novo cria set com eventDate futura → status scheduled', () => {
    // TODO: goto /sets/novo, fill name+date+briefing, submit, assert URL /sets/[id]/montar
  });
  test('US3-AC1: criação sem eventDate → status draft; list mostra "Rascunho"', () => {
    // TODO
  });
  test('US3-AC2: filtros iniciais renderizam sem candidatos ativos se ninguém foi selected', () => {
    // TODO
  });
});
