import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route guard — REDIRECTS ONLY. This is not a security boundary.
 *
 * It checks whether an auth cookie is PRESENT, not whether it is VALID —
 * middleware runs on the edge with no database and no JWT secret, so it cannot
 * verify anything, and it must not pretend to.
 *
 * The real authorisation lives in the API: `requireAuth` re-reads the account on
 * every request, `requireAdmin` checks the role from the row, and every job query
 * filters by the student's own department in SQL. Someone who forges a cookie to
 * get past this file reaches a dashboard whose every request then 401s. All they
 * have defeated is their own user experience.
 *
 * This is a CLOSED system: everything except the login screen requires a session.
 * There is no public browsing, because opportunities are department-gated and an
 * anonymous visitor has no department.
 */

const ACCESS_COOKIE = 'cch_access';

/** The only routes reachable without a session. */
const PUBLIC_ROUTES = ['/login'];

/**
 * Reachable while locked out of everything else.
 *
 * A student whose password is still their USN can hold a valid session and yet be
 * refused by every endpoint but one. They must be able to reach the screen that
 * lets them fix that — and the API's PASSWORD_CHANGE_REQUIRED response is what
 * actually sends them here.
 */
const LOCKOUT_ROUTES = ['/first-login'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(ACCESS_COOKIE)?.value);

  const isPublic = PUBLIC_ROUTES.some((p) => pathname.startsWith(p));
  const isLockout = LOCKOUT_ROUTES.some((p) => pathname.startsWith(p));

  // Signed out, asking for anything real → login, remembering where they wanted
  // to go so signing in returns them there rather than to a generic dashboard.
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Signed in, sitting on the login page → send them onward.
  // `/first-login` is exempt: a student who has just signed in with their USN
  // has a session AND needs to be there.
  if (hasSession && isPublic && !isLockout) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and the image optimiser — running middleware on every
  // .svg request is pure latency for no benefit.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
