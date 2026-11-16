import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { localPostgres } from '../tests/local-postgres.mjs';
import { previewAccessPath, previewPort } from './preview-location.mjs';
const database = await localPostgres();
const password = randomBytes(24).toString('base64url');
const port = previewPort;
await mkdir('.local', { recursive: true });
await writeFile(previewAccessPath, JSON.stringify({ url: `http://127.0.0.1:${port}`, password }));
const mode = process.env.PREVIEW_DEV === 'true' ? ['dev', '--webpack'] : ['start'];
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...mode, '--hostname', '127.0.0.1', '--port', port], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: database.url, DIRECT_URL: database.url, OWNER_PASSWORD: password, AUTH_SECRET: randomBytes(32).toString('hex'), CRON_SECRET: randomBytes(32).toString('hex'), PUBLIC_APP_URL: `http://127.0.0.1:${port}`, EMAIL_PROVIDER: 'gmail', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GMAIL_REFRESH_TOKEN: '', RESEND_API_KEY: '', RESEND_WEBHOOK_SECRET: '', INBOUND_REPLY_DOMAIN: '', LOCAL_TEST_WORKSPACE: 'true' } });
let stopping = false;
async function stop() { if (stopping) return; stopping = true; app.kill('SIGTERM'); await database.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop); app.on('exit', stop);
console.log(`Isolated preview at http://127.0.0.1:${port}; no real emails or production data. Access details are in ignored ${previewAccessPath}.`);
