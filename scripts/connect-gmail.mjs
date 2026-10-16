import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
loadEnvConfig(process.cwd());
const client = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
if (!client || !secret) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.');
const redirect = 'http://127.0.0.1:53682/callback', state = randomBytes(32).toString('hex');
const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorize.search = new URLSearchParams({ client_id: client, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent', state, login_hint: 'afiqamri03@gmail.com', scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly' }).toString();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:53682'); const returned = url.searchParams.get('state') || '';
    if (url.pathname !== '/callback' || returned.length !== state.length || !timingSafeEqual(Buffer.from(returned), Buffer.from(state))) { res.writeHead(400); res.end('Invalid connection request.'); return; }
    const code = url.searchParams.get('code'); if (!code) throw new Error('Google access was not granted.');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client, client_secret: secret, code, redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const token = await response.json();
    if (!response.ok || typeof token.refresh_token !== 'string' || typeof token.access_token !== 'string') throw new Error('Google did not return offline access. Reconnect with consent.');
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || profile.emailAddress?.toLowerCase() !== 'afiqamri03@gmail.com') throw new Error('Use afiqamri03@gmail.com to connect this workspace.');
    let env = ''; try { env = await readFile('.env.local', 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const line = `GMAIL_REFRESH_TOKEN=${JSON.stringify(token.refresh_token)}`;
    env = /^GMAIL_REFRESH_TOKEN=.*$/m.test(env) ? env.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, () => line) : env.trimEnd() + '\n' + line + '\n';
    await writeFile('.env.local', env, { mode: 0o600 });
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('Gmail connected. You can close this tab. Restart the app and test the connection in Settings.');
    console.log('Connected afiqamri03@gmail.com. Refresh token saved privately to .env.local. No email was sent.');
    clearTimeout(timeout); server.close();
  } catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end(e.message); }
});
const timeout = setTimeout(() => { console.error('Connection timed out. Run this command again.'); server.close(); }, 600000);
server.listen(53682, '127.0.0.1', () => console.log(`Open this URL in your browser to connect Gmail:\n${authorize.href}`));
