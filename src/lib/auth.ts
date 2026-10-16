import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
export const COOKIE = 'zwf_owner';
export function authConfigured() { return (process.env.OWNER_PASSWORD?.length ?? 0) >= 12 && (process.env.AUTH_SECRET?.length ?? 0) >= 32; }
export function equalSecret(a: string, b: string) { return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()); }
function signature(value: string) { return createHmac('sha256', process.env.AUTH_SECRET ?? '').update(value).digest('base64url'); }
export function createSession() { const payload = `${Date.now() + 12 * 3600000}`; return `${payload}.${signature(payload)}`; }
export function validSession(token: string | undefined) {
  if (!authConfigured() || !token) return false;
  const [expires, sig, extra] = token.split('.');
  return !extra && !!sig && Number(expires) > Date.now() && equalSecret(sig, signature(expires));
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = process.env.PUBLIC_APP_URL || new URL(request.url).origin;
  try { return !!origin && new URL(origin).origin === new URL(expected).origin; } catch { return false; }
}
