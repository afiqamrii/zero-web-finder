import { NextResponse } from 'next/server';
import { authConfigured, COOKIE, createSession, equalSecret, sameOrigin } from '@/lib/auth';
import { failure, jsonBody } from '@/lib/http';
const attempts = new Map<string, { count: number; reset: number }>();
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  if (!authConfigured()) return NextResponse.json({ error: 'Set OWNER_PASSWORD (12+ characters) and AUTH_SECRET (32+ characters) on the server first.' }, { status: 503 });
  // Per-process global limiter cannot be bypassed by spoofing forwarding headers.
  const key = 'owner';
  const limit = attempts.get(key);
  if (limit && limit.reset > Date.now() && limit.count >= 10) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  try {
    const { password } = await jsonBody(request);
    if (typeof password !== 'string' || !equalSecret(password, process.env.OWNER_PASSWORD!)) {
      attempts.set(key, { count: limit && limit.reset > Date.now() ? limit.count + 1 : 1, reset: limit && limit.reset > Date.now() ? limit.reset : Date.now() + 900000 });
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }
    attempts.delete(key);
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE, createSession(), { httpOnly: true, secure: new URL(request.url).protocol === 'https:' || process.env.PUBLIC_APP_URL?.startsWith('https://'), sameSite: 'strict', path: '/', maxAge: 43200 });
    return response;
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const response = NextResponse.json({ success: true }); response.cookies.delete(COOKIE); return response;
}
