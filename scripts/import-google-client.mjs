import { readFile, writeFile } from 'node:fs/promises';
const path = process.argv[2] || '.local/launch/google-client.json';
let json;
try { json = JSON.parse(await readFile(path, 'utf8')); }
catch { throw new Error('Could not read a valid Google client JSON file. Save the downloaded file at .local/launch/google-client.json, then try again.'); }
const client = json.web || json.installed;
if (!client || typeof client.client_id !== 'string' || typeof client.client_secret !== 'string' || !client.client_secret.trim() || !client.client_id.endsWith('.apps.googleusercontent.com')) throw new Error('Use the Google OAuth client JSON downloaded from your own Google Cloud project.');
if (json.web && !client.redirect_uris?.includes('http://127.0.0.1:53682/callback')) throw new Error('Add http://127.0.0.1:53682/callback to the web client redirect URIs, then download the JSON again.');
let text = '';
try { text = await readFile('.env.local', 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const [key, value] of Object.entries({ GOOGLE_CLIENT_ID: client.client_id, GOOGLE_CLIENT_SECRET: client.client_secret, EMAIL_PROVIDER: 'gmail' })) {
  const entry = `${key}=${JSON.stringify(value)}`, pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, () => entry) : text.trimEnd() + '\n' + entry + '\n';
}
await writeFile('.env.local', text, { mode: 0o600 });
console.log('Google client imported into ignored .env.local. No secret was printed. Run npm run gmail:connect to grant access.');
