import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGmailSession, GMAIL_OWNER, GMAIL_REDIRECT, GMAIL_SCOPES, parseGoogleClient, safeSetupMessage, saveEnvValues, updateEnvValues } from '../scripts/gmail-setup.mjs';

const token = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer', scope: GMAIL_SCOPES.join(' ') };
const credentials = { client: '123-test.apps.googleusercontent.com', secret: 'test-client-secret' };
function setup(fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(token)).mockResolvedValueOnce(Response.json({ emailAddress: GMAIL_OWNER })), extra = {}) {
  const saveRefreshToken = vi.fn().mockResolvedValue(undefined);
  const session = createGmailSession({ ...credentials, fetchImpl, saveRefreshToken, ...extra });
  const state = new URL(session.authorizeUrl).searchParams.get('state');
  const request = { method: 'GET', host: '127.0.0.1:53682', url: `/callback?state=${state}&code=test-code` };
  return { session, request, saveRefreshToken, fetchImpl };
}

describe('Gmail setup OAuth session', () => {
  it('requires full consent and owner identity before saving, and uses PKCE', async () => {
    const { session, request, fetchImpl, saveRefreshToken } = setup();
    const authorization = new URL(session.authorizeUrl);
    expect(authorization.searchParams.get('scope')).toBe(GMAIL_SCOPES.join(' '));
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.has('client_secret')).toBe(false);
    expect(await session.callback(request)).toMatchObject({ status: 200, complete: true });
    expect(saveRefreshToken).toHaveBeenCalledExactlyOnceWith('test-refresh');
    const body = fetchImpl.mock.calls[0][1].body as URLSearchParams;
    const verifier = body.get('code_verifier')!;
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));
    expect(body.get('redirect_uri')).toBe(GMAIL_REDIRECT);
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(['https://oauth2.googleapis.com/token', 'https://gmail.googleapis.com/gmail/v1/users/me/profile']);
  });

  it.each([undefined, GMAIL_SCOPES[0], GMAIL_SCOPES[1], `${GMAIL_SCOPES[0]}.invalid ${GMAIL_SCOPES[1]}`])('preserves credentials when granted scope is incomplete: %s', async scope => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ ...token, scope }));
    const { session, request, saveRefreshToken } = setup(fetchImpl);
    expect(await session.callback(request)).toMatchObject({ status: 400, complete: true, body: expect.stringContaining('Both Gmail sending and read access') });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(saveRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects the wrong Gmail account without saving credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(token)).mockResolvedValueOnce(Response.json({ emailAddress: 'another@example.test' }));
    const { session, request, saveRefreshToken } = setup(fetchImpl);
    expect(await session.callback(request)).toMatchObject({ status: 400, complete: true });
    expect(saveRefreshToken).not.toHaveBeenCalled();
  });

  it('validates method, host, origin, path, state bytes and duplicate state without consuming a valid session', async () => {
    const { session, request, fetchImpl } = setup();
    const invalid = [
      { ...request, method: 'POST' }, { ...request, host: 'evil.test' },
      { ...request, url: 'https://evil.test' + request.url },
      { ...request, url: request.url.replace('/callback', '/other') },
      { ...request, url: '/callback?state=' + 'é'.repeat(64) + '&code=test-code' },
      { ...request, url: request.url + '&state=duplicate' },
    ];
    for (const callback of invalid) expect(await session.callback(callback)).toMatchObject({ status: 400, complete: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await session.callback(request)).toMatchObject({ status: 200 });
  });

  it('consumes valid state before token exchange so concurrent or replayed callbacks cannot save twice', async () => {
    let finish!: (response: Response) => void;
    const fetchImpl = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValueOnce(Response.json({ emailAddress: GMAIL_OWNER }));
    const { session, request, saveRefreshToken } = setup(fetchImpl);
    const pending = session.callback(request);
    expect(await session.callback(request)).toMatchObject({ status: 409 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    finish(Response.json(token));
    expect(await pending).toMatchObject({ status: 200 });
    expect(await session.callback(request)).toMatchObject({ status: 409 });
    expect(saveRefreshToken).toHaveBeenCalledOnce();
  });

  it('treats denial and duplicate codes as terminal without echoing provider details', async () => {
    for (const suffix of ['&error=denied&error_description=secret-value', '&code=duplicate']) {
      const { session, request, fetchImpl, saveRefreshToken } = setup();
      const result = await session.callback({ ...request, url: request.url + suffix });
      expect(result).toMatchObject({ status: 400, complete: true });
      expect(result.body).not.toContain('secret-value');
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(saveRefreshToken).not.toHaveBeenCalled();
      expect(await session.callback(request)).toMatchObject({ status: 409 });
    }
  });

  it('rejects expired sessions, including expiry during account verification', async () => {
    let now = 0;
    const expired = setup(undefined, { now: () => now, ttlMs: 100 });
    now = 100;
    expect(await expired.session.callback(expired.request)).toMatchObject({ status: 410 });
    expect(expired.fetchImpl).not.toHaveBeenCalled();
    now = 0;
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(token)).mockImplementationOnce(() => { now = 100; return Response.json({ emailAddress: GMAIL_OWNER }); });
    const during = setup(fetchImpl, { now: () => now, ttlMs: 100 });
    expect(await during.session.callback(during.request)).toMatchObject({ status: 410 });
    expect(during.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('never exposes raw network or malformed JSON errors and does not save invalid offline tokens', async () => {
    const responses = [
      () => { throw new Error('authorization-code test-access client-secret'); },
      () => new Response('sensitive-invalid-json', { status: 200 }),
      () => Response.json({ ...token, refresh_token: '' }),
      () => Response.json({ ...token, token_type: 'invalid' }),
      () => Response.json({ error_description: 'sensitive-provider-error' }, { status: 400 }),
    ];
    for (const response of responses) {
      const { session, request, saveRefreshToken } = setup(vi.fn().mockImplementation(response));
      const result = await session.callback(request);
      expect(result.status).toBe(400);
      expect(result.body).not.toMatch(/authorization-code|test-access|client-secret|sensitive/);
      expect(saveRefreshToken).not.toHaveBeenCalled();
    }
    expect(safeSetupMessage(new Error('private disk path and secret'))).not.toContain('private disk path');
  });
});

describe('Google client import and private environment updates', () => {
  const client = { client_id: credentials.client, client_secret: credentials.secret, redirect_uris: [GMAIL_REDIRECT] };
  it('accepts downloaded web/desktop clients and rejects malformed or ambiguous redirects', () => {
    expect(parseGoogleClient({ web: client })).toMatchObject({ GOOGLE_CLIENT_ID: credentials.client, EMAIL_PROVIDER: 'gmail' });
    expect(parseGoogleClient({ installed: client })).toMatchObject({ GOOGLE_CLIENT_SECRET: credentials.secret });
    expect(() => parseGoogleClient({ web: { ...client, redirect_uris: GMAIL_REDIRECT } })).toThrow('redirect URIs');
    expect(() => parseGoogleClient({ web: { ...client, redirect_uris: [GMAIL_REDIRECT + '/wrong'] } })).toThrow('redirect URIs');
    expect(() => parseGoogleClient({ web: client, installed: client })).toThrow('OAuth client JSON');
    expect(() => parseGoogleClient({ web: { ...client, client_secret: 'injected\nVALUE=bad' } })).toThrow('OAuth client JSON');
  });

  it('removes duplicate/exported keys while preserving unrelated private values and line endings', () => {
    const previous = '# private\r\nDATABASE_URL="keep-unchanged"\r\nexport GMAIL_REFRESH_TOKEN = "old"\r\nGMAIL_REFRESH_TOKEN="duplicate"\r\n';
    const updated = updateEnvValues(previous, { GMAIL_REFRESH_TOKEN: 'new' });
    expect(updated).toBe('# private\r\nDATABASE_URL="keep-unchanged"\r\nGMAIL_REFRESH_TOKEN="new"\r\n');
  });

  it('replaces a temporary test environment atomically without losing unrelated settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gmail-setup-test-'));
    const path = join(directory, '.env.test-only');
    try {
      await writeFile(path, 'KEEP="unchanged"\nGMAIL_REFRESH_TOKEN="old"\n');
      await saveEnvValues({ GMAIL_REFRESH_TOKEN: 'new-test-token' }, path);
      expect(await readFile(path, 'utf8')).toBe('KEEP="unchanged"\nGMAIL_REFRESH_TOKEN="new-test-token"\n');
      expect(await readdir(directory)).toEqual(['.env.test-only']);
    } finally { await unlink(path); await rmdir(directory); }
  });
});
