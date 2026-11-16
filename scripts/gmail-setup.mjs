import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';

export const GMAIL_REDIRECT = 'http://127.0.0.1:53682/callback';
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
export const GMAIL_OWNER = 'afiqamri03@gmail.com';

const messages = {
  client: 'Use the OAuth client JSON downloaded from your own Google Cloud project.',
  redirect: `Add ${GMAIL_REDIRECT} to the web client redirect URIs, then download the JSON again.`,
  request: 'Invalid connection request. Return to the original Google consent link.',
  used: 'This connection request has already been used. Run npm run gmail:connect again.',
  expired: 'Connection timed out. Run npm run gmail:connect again.',
  denied: 'Google access was not granted. Run npm run gmail:connect again to grant access.',
  token: 'Google did not return valid offline access. Run npm run gmail:connect again with consent.',
  scopes: 'Both Gmail sending and read access are required. Run npm run gmail:connect again and grant both permissions. Existing credentials were not changed.',
  profile: `Could not verify Gmail access for ${GMAIL_OWNER}. Check the Gmail API is enabled and connect that account.`,
  save: 'Could not save the Gmail setup privately. Check .env.local permissions and try again.',
  unknown: 'Gmail connection failed. Existing credentials were not changed. Run npm run gmail:connect again.',
};

export class GmailSetupError extends Error {
  constructor(code) { super(messages[code] ?? messages.unknown); this.name = 'GmailSetupError'; }
}
export function safeSetupMessage(error) { return error instanceof GmailSetupError ? error.message : messages.unknown; }

export function parseGoogleClient(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || (!!json.web === !!json.installed)) throw new GmailSetupError('client');
  const client = json.web || json.installed;
  if (!client || typeof client !== 'object' || typeof client.client_id !== 'string' || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(client.client_id) || typeof client.client_secret !== 'string' || !/^[A-Za-z0-9_-]{8,512}$/.test(client.client_secret)) throw new GmailSetupError('client');
  if (json.web && (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(GMAIL_REDIRECT))) throw new GmailSetupError('redirect');
  return { GOOGLE_CLIENT_ID: client.client_id, GOOGLE_CLIENT_SECRET: client.client_secret, EMAIL_PROVIDER: 'gmail' };
}

export function updateEnvValues(text, values) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const keys = new Set(Object.keys(values));
  const lines = text.split(/\r?\n/).filter(line => {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    return !match || !keys.has(match[1]);
  });
  const prefix = lines.join(newline).trimEnd();
  return (prefix ? prefix + newline : '') + Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(newline) + newline;
}

export async function saveEnvValues(values, path = '.env.local') {
  const temporary = `${path}.tmp-${randomBytes(12).toString('hex')}`;
  try {
    let text = '';
    try { text = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(temporary, updateEnvValues(text, values), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new GmailSetupError('save');
  }
}

export function createGmailSession({ client, secret, saveRefreshToken, fetchImpl = fetch, now = Date.now, ttlMs = 600000 }) {
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  const expiresAt = now() + ttlMs;
  let consumed = false;
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.search = new URLSearchParams({ client_id: client, redirect_uri: GMAIL_REDIRECT, response_type: 'code', access_type: 'offline', prompt: 'consent', state, login_hint: GMAIL_OWNER, scope: GMAIL_SCOPES.join(' '), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  const result = (status, body, complete = false) => ({ status, body, complete });

  async function callback({ method, url: requestUrl, host }) {
    let url;
    try { url = new URL(requestUrl, GMAIL_REDIRECT); } catch { return result(400, messages.request); }
    const returned = url.searchParams.get('state') ?? '';
    if (method !== 'GET' || host !== '127.0.0.1:53682' || url.origin !== 'http://127.0.0.1:53682' || url.pathname !== '/callback' || url.hash || url.searchParams.getAll('state').length !== 1 || !/^[a-f0-9]{64}$/.test(returned) || !timingSafeEqual(Buffer.from(returned), Buffer.from(state))) return result(400, messages.request);
    if (consumed) return result(409, messages.used);
    consumed = true; // Consume before any await: concurrent callbacks cannot exchange or save twice.
    if (now() >= expiresAt) return result(410, messages.expired, true);
    if (url.searchParams.has('error')) return result(400, messages.denied, true);
    const code = url.searchParams.get('code');
    if (url.searchParams.getAll('code').length !== 1 || !code || code.length > 4096 || /[\x00-\x20\x7f]/.test(code)) return result(400, messages.request, true);
    try {
      const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client, client_secret: secret, code, redirect_uri: GMAIL_REDIRECT, grant_type: 'authorization_code', code_verifier: verifier }) });
      if (!response.ok) throw new GmailSetupError('token');
      const token = await response.json();
      if (typeof token?.refresh_token !== 'string' || !token.refresh_token.trim() || typeof token.access_token !== 'string' || !token.access_token.trim() || /[\r\n\0]/.test(token.refresh_token + token.access_token) || String(token.token_type).toLowerCase() !== 'bearer') throw new GmailSetupError('token');
      const granted = new Set(typeof token.scope === 'string' ? token.scope.split(/\s+/) : []);
      if (!GMAIL_SCOPES.every(scope => granted.has(scope))) throw new GmailSetupError('scopes');
      const profileResponse = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/profile', { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!profileResponse.ok) throw new GmailSetupError('profile');
      const profile = await profileResponse.json();
      if (typeof profile?.emailAddress !== 'string' || profile.emailAddress.toLowerCase() !== GMAIL_OWNER) throw new GmailSetupError('profile');
      if (now() >= expiresAt) return result(410, messages.expired, true);
      await saveRefreshToken(token.refresh_token);
      return result(200, 'Gmail connected. You can close this tab. Restart the app and test the connection in Settings.', true);
    } catch (error) { return result(400, safeSetupMessage(error), true); }
  }
  return { authorizeUrl: authorize.href, callback };
}
