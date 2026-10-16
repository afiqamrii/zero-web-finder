import nextEnv from '@next/env';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
let text = '';
try { text = await readFile('.env.local', 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const created = [];
for (const [key, value] of Object.entries({ OWNER_PASSWORD: randomBytes(24).toString('base64url'), AUTH_SECRET: randomBytes(32).toString('hex'), CRON_SECRET: randomBytes(32).toString('hex'), EMAIL_PROVIDER: 'gmail' })) {
  if (process.env[key]) continue;
  const entry = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, () => entry) : text.trimEnd() + '\n' + entry + '\n';
  created.push(key);
}
if (created.length) await writeFile('.env.local', text, { mode: 0o600 });
await mkdir('.local/launch', { recursive: true });
console.log(created.length ? `Prepared ${created.join(', ')} in ignored .env.local. No values printed.` : 'Existing launch secrets preserved.');
console.log('Database and Gmail credentials are unchanged. No deployment or email was triggered.');
