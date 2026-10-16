import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, sameOrigin, validSession } from '@/lib/auth';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = path === '/login' || path === '/api/session' || path === '/api/health' || path === '/api/worker' || path === '/api/webhooks/resend' || path === '/unsubscribe';
  if (!publicRoute && !validSession(request.cookies.get(COOKIE)?.value)) {
    return path.startsWith('/api/') ? NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }) : NextResponse.redirect(new URL('/login', request.url));
  }
  if (!publicRoute && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return NextResponse.json({ error: 'Request origin does not match this workspace.' }, { status: 403 });
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
