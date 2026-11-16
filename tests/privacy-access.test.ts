import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSession, COOKIE } from '@/lib/auth';
import { proxy } from '@/proxy';

const origin = 'https://workspace.test';
beforeEach(() => {
  vi.stubEnv('OWNER_PASSWORD', 'test-owner-password');
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret-'.repeat(3));
  vi.stubEnv('PUBLIC_APP_URL', origin);
});
afterEach(() => vi.unstubAllEnvs());

describe('public privacy page access boundary', () => {
  it.each(['GET', 'HEAD'])('allows anonymous %s without requiring configured owner credentials', method => {
    vi.stubEnv('OWNER_PASSWORD', '');
    vi.stubEnv('AUTH_SECRET', '');
    const response = proxy(new NextRequest(`${origin}/privacy?from=login`, { method }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it.each(['/', '/privacy/internal', '/privacy-export'])('keeps private page %s behind owner sign-in', path => {
    const response = proxy(new NextRequest(origin + path));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(origin + '/login');
  });

  it.each(['/api/leads?next=/privacy', '/api/settings', '/api/campaigns', '/api/tasks', '/api/gmail/check', '/api/privacy'])('does not expose private API %s', async path => {
    const response = proxy(new NextRequest(origin + path));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in to continue.' });
  });

  it('does not add an anonymous write exception for privacy', () => {
    const response = proxy(new NextRequest(origin + '/privacy', { method: 'POST' }));
    expect(response.status).toBe(307);
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  it('preserves authenticated reads and same-origin write protection', () => {
    const cookie = `${COOKIE}=${createSession()}`;
    expect(proxy(new NextRequest(origin + '/api/leads', { headers: { Cookie: cookie } })).headers.get('x-middleware-next')).toBe('1');
    const allowed = proxy(new NextRequest(origin + '/api/tasks', { method: 'POST', headers: { Cookie: cookie, Origin: origin } }));
    expect(allowed.headers.get('x-middleware-next')).toBe('1');
    for (const path of ['/api/tasks', '/privacy']) {
      const blocked = proxy(new NextRequest(origin + path, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.test' } }));
      expect(blocked.status).toBe(403);
    }
  });
});
