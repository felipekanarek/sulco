import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/convite-fechado',
  '/api/webhooks/clerk',
  '/api/cron/sync-daily',
]);

const isPlaylistsRoute = createRouteMatcher(['/playlists(.*)']);

export default clerkMiddleware(async (auth, req) => {
  // FR-053a: playlists fora de escopo
  if (isPlaylistsRoute(req)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Rotas públicas passam livres
  if (isPublicRoute(req)) {
    return;
  }

  // Todas as outras exigem sessão. A decisão "já concluiu onboarding?"
  // fica nas próprias páginas (ex: `/` redireciona para `/onboarding`
  // quando `needsOnboarding === true`). Isso evita qualquer loop de
  // redirect no nível do middleware.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
