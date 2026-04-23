import { describe, it } from 'vitest';

/**
 * T040 — Testes de integração do `runInitialImport`.
 *
 * Cenários cobertos:
 * - 2 páginas × 100 releases cada = 200 records criados com defaults autorais
 *   corretos (status=unrated, selected=false, isBomb=false, moods=[], etc.).
 * - Rate limit token bucket respeitado (60 req/min).
 * - Retomada a partir de `lastCheckpointPage` após pausa por 429.
 * - 401 marca credencial como invalid e aborta sem crash.
 *
 * NOTA: Este arquivo está em formato TODO. A implementação exige fixture de
 * DB in-memory (`:memory:` via `@libsql/client`) + mock estruturado do
 * cliente Discogs. Fica como iteração futura de cobertura.
 */

describe.skip('runInitialImport', () => {
  it.todo('cria records com defaults autorais (status=unrated, isBomb=false, moods=[])');
  it.todo('paginação: 2 páginas × 100 = 200 records; checkpoint avança por página');
  it.todo('rate limit: 60ª req aguarda; 61ª só executa após refill');
  it.todo('429 com Retry-After → outcome rate_limited; próximo run retoma de lastCheckpointPage+1');
  it.todo('401 → markCredentialInvalid; syncRun vira outcome=erro com mensagem "Token Discogs rejeitado"');
  it.todo('reaparição: disco archived=true + release volta → archived=false, autorais intactos');
  it.todo('faixas removidas de um release → conflict=true; autorais preservados');
});
