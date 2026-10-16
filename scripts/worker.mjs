import nextEnv from '@next/env';
import { setTimeout as delay } from 'node:timers/promises';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const origin = process.env.WORKER_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
  console.error('Set CRON_SECRET (32+ characters) before starting the worker.');
  process.exit(1);
}
const shutdown = new AbortController();
process.on('SIGTERM', () => shutdown.abort());
process.on('SIGINT', () => shutdown.abort());
console.log('Automation worker started; checking the queue every minute.');
while (!shutdown.signal.aborted) {
  try {
    const response = await fetch(`${origin}/api/worker`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(300000)]) });
    if (!response.ok) { console.error(`Worker request failed (${response.status}).`); if (process.argv.includes('--once')) process.exitCode = 1; }
    else { const result = await response.json(); if (result.sent || result.discovered) console.log(`Processed: ${result.sent} emails accepted, ${result.discovered} leads.`); }
  } catch { if (!shutdown.signal.aborted) { console.error('Worker could not reach the app. Check the app and WORKER_APP_URL.'); if (process.argv.includes('--once')) process.exitCode = 1; } }
  if (process.argv.includes('--once')) break;
  await delay(60000, undefined, { signal: shutdown.signal }).catch(() => {});
}
