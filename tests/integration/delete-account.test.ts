import { describe, it } from 'vitest';

/**
 * T110 — FR-042, FR-043 cascade delete.
 *
 * Exige mock do `clerkClient.users.deleteUser` + DB in-memory populated.
 * Ficou como TODO pra iteração futura com fixtures completos — a lógica
 * pura está coberta pelo tsc + revisão manual do action.
 */
describe.skip('deleteAccount', () => {
  it.todo('rejeita se confirm !== "APAGAR"');
  it.todo('cascade delete remove records, tracks, sets, setTracks, syncRuns do user');
  it.todo('aborta syncRuns com outcome=running antes do delete');
  it.todo('chama clerkClient.users.deleteUser(clerkUserId)');
  it.todo('se Clerk falhar, DB já foi limpo e action retorna ok (webhook cuida)');
  it.todo('outro user do DB permanece intacto (isolamento)');
});
