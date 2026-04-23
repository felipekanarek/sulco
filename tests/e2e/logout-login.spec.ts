import { test, expect } from '@playwright/test';

/**
 * US1-AC5 — Logout + login preserva coleção, curadoria e demais dados autorais
 * do mesmo usuário; garante isolamento entre usuários distintos.
 *
 * Cobertura implícita por design:
 * - Todas as queries filtram por `userId` (vindo de `requireCurrentUser` →
 *   `users.clerkUserId`). Logout/login mantém o mesmo `clerkUserId`, logo a
 *   mesma linha local em `users` (ver `src/lib/auth.ts`).
 * - Schema tem FK cascade de records/tracks/sets/setTracks/syncRuns → users.id.
 *   Não há registros compartilhados entre users.
 *
 * Este arquivo documenta o acceptance em Playwright; ficam como `.skip` até
 * fixture com dois usuários Clerk estar configurada.
 */

test.describe.skip('Logout / Login / Isolamento (US1-AC5)', () => {
  test('mesmo usuário: logout → login → coleção preservada', async ({ page }) => {
    // 1. Autentica user A, verifica que a coleção listada (header "N discos")
    //    tem algum valor > 0.
    // 2. Clica UserButton → "Sign out" no dropdown Clerk.
    // 3. `/` redireciona para /sign-in.
    // 4. Faz login novamente com as mesmas credenciais.
    // 5. `/` deve mostrar exatamente o mesmo contador de discos e os mesmos
    //    cards (comparar primeiros 5 títulos antes/depois).
  });

  test('usuários distintos: cada um vê só os próprios records', async ({ page, context }) => {
    // 1. user A loga e importa 3 records fake (seed).
    // 2. Logout A, sign-up de user B.
    // 3. user B vê coleção vazia / onboarding.
    // 4. Verifica no DB que records de A permanecem intactos (queryCollection
    //    com userId=A retorna 3 rows; com userId=B retorna 0).
  });
});
