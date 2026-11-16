import { setTimeout as delay } from 'node:timers/promises';

export function workerConfiguration(environment) {
  const secret = environment.CRON_SECRET;
  if (!secret || secret.length < 32) throw new Error('Set CRON_SECRET (32+ characters) before starting the worker.');
  const value = environment.WORKER_APP_URL || `http://127.0.0.1:${environment.PORT || 3000}`;
  let url;
  try { url = new URL(value); } catch { throw new Error('WORKER_APP_URL must be an absolute HTTP or HTTPS URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('WORKER_APP_URL must be an HTTP or HTTPS URL without credentials, query, or fragment.');
  }
  return { origin: url.href.replace(/\/$/, ''), secret };
}

export async function runWorker({ origin, secret, signal, once = false, fetchImpl = fetch, logger = console }) {
  let exitCode = 0;
  logger.log('Automation worker started; checking the queue every minute.');
  while (!signal.aborted) {
    try {
      // Stop scheduling on shutdown, but keep the active HTTP connection open.
      // Next waits for that request before exiting; aborting it can interrupt a
      // provider acknowledgement and leave an accepted email unreconciled.
      const response = await fetchImpl(`${origin}/api/worker`, {
        method: 'POST', headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(300000),
      });
      if (!response.ok) {
        logger.error(`Worker request failed (${response.status}).`);
        if (once) exitCode = 1;
      } else {
        const result = await response.json();
        if (result.sent || result.discovered) logger.log(`Processed: ${result.sent} emails accepted, ${result.discovered} leads.`);
      }
    } catch {
      logger.error('Worker could not reach the app. Check the app and WORKER_APP_URL.');
      if (once) exitCode = 1;
    }
    if (once || signal.aborted) break;
    await delay(60000, undefined, { signal }).catch(() => {});
  }
  return exitCode;
}
