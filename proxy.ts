// proxy.ts
// Next.js 16 renamed `middleware` to `proxy` (middleware.ts is deprecated).
// This runs before routes render and does two jobs:
//   1. a per-request nonce-based Content-Security-Policy
//   2. a cheap gate on the reserved staff namespaces, so an unauthenticated
//      visitor cannot even reach the admin/shop/support surfaces
//
// Authorisation itself is NOT decided here — it is enforced server-side on every
// /api/v1 route against the actor's real session. This gate only avoids
// rendering staff UI to anonymous visitors.

import { NextResponse, type NextRequest } from 'next/server';

/** Prefixes that front staff-only surfaces. */
const RESERVED_NAMESPACES = ['/admin', '/shop', '/support'];

const SESSION_COOKIE = 'gb_session';

function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    `default-src 'self'`,
    // Scripts are nonce'd and locked down; 'strict-dynamic' lets Next's own
    // bundles load without listing every chunk.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,
    // React renders inline `style` attributes for things like dynamic
    // background images, which CSP treats like inline styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://images.unsplash.com https://*.supabase.co`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.supabase.co https://api.razorpay.com https://challenges.cloudflare.com`,
    `frame-src 'self' https://api.razorpay.com https://challenges.cloudflare.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `worker-src 'self' blob:`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ];
  return directives.join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isReserved = RESERVED_NAMESPACES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (isReserved && !hasSession) {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('auth', 'required');
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads this request header to attach the nonce to its own script tags.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except API routes (they set their own headers), Next's static
    // output, the image optimiser and the favicon.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};
