import nextEnv from '@next/env';
import { createServer } from 'node:http';
import { createGmailSession, saveEnvValues } from './gmail-setup.mjs';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const client = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
if (!client || !secret) { console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.'); process.exit(1); }
const session = createGmailSession({ client, secret, saveRefreshToken: token => saveEnvValues({ GMAIL_REFRESH_TOKEN: token }) });
const server = createServer(async (req, res) => {
  const result = await session.callback({ method: req.method, url: req.url, host: req.headers.host });
  res.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  res.end(result.body);
  if (result.complete) {
    clearTimeout(timeout); server.close();
    if (result.status === 200) console.log('Connected afiqamri03@gmail.com. Both Gmail permissions verified; refresh token saved privately to .env.local. No email was sent.');
    else { console.error(result.body); process.exitCode = 1; }
  }
});
const timeout = setTimeout(() => { console.error('Connection timed out. Run this command again.'); process.exitCode = 1; server.close(); server.closeAllConnections(); }, 600000);
server.on('error', () => { clearTimeout(timeout); console.error('Could not start the local Gmail callback on port 53682. Close the other connection helper and try again.'); process.exitCode = 1; });
server.listen(53682, '127.0.0.1', () => console.log(`Open this URL in your browser to connect Gmail:\n${session.authorizeUrl}`));
