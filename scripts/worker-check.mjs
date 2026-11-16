import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { workerConfiguration, runWorker } from './worker-runtime.mjs';
const secret = randomBytes(32).toString('hex');
const messages = [];
const logger = { log: value => messages.push(value), error: value => messages.push(value) };
assert.throws(() => workerConfiguration({}), /CRON_SECRET/);
assert.throws(() => workerConfiguration({ CRON_SECRET: secret, WORKER_APP_URL: 'file:///tmp/worker' }), /HTTP/);
assert.throws(() => workerConfiguration({ CRON_SECRET: secret, WORKER_APP_URL: 'https://user:password@app.example' }), /without credentials/);
assert.deepEqual(workerConfiguration({ CRON_SECRET: secret, PORT: '10000' }), { origin: 'http://127.0.0.1:10000', secret });
assert.equal(workerConfiguration({ CRON_SECRET: secret, WORKER_APP_URL: 'https://app.example/' }).origin, 'https://app.example');

// A deployment must let an active acknowledgement finish after SIGTERM.
const shutdown = new AbortController();
let activeSignal, finishRequest, calls = 0, settled = false;
const draining = runWorker({
  origin: 'http://127.0.0.1:3000', secret, signal: shutdown.signal, logger,
  fetchImpl: async (_url, options) => {
    calls++; activeSignal = options.signal;
    return await new Promise(resolve => { finishRequest = resolve; });
  },
}).then(code => { settled = true; return code; });
shutdown.abort();
await Promise.resolve();
assert.equal(activeSignal.aborted, false, 'shutdown must not abort the active worker request');
assert.equal(settled, false, 'worker must wait for the active response');
finishRequest({ ok: true, json: async () => ({ sent: 1, discovered: 0 }) });
assert.equal(await draining, 0);
assert.equal(calls, 1, 'shutdown must not schedule another request');
assert(messages.some(message => message.includes('1 emails accepted')));
assert(messages.every(message => !message.includes(secret)));

// A stopped worker never starts another request, even when restarted by a host.
let stoppedCalls = 0;
await runWorker({ origin: 'http://127.0.0.1:3000', secret, signal: shutdown.signal, logger, fetchImpl: async () => { stoppedCalls++; throw new Error('Unexpected request'); } });
assert.equal(stoppedCalls, 0);
const requests = [];
let responseStatus = 200;
const server = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url, authorization: req.headers.authorization });
  res.writeHead(responseStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ sent: 0, discovered: 0 }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
async function tick(script = 'worker.mjs', environment = {}) {
  const child = spawn(process.execPath, [`scripts/${script}`, '--once'], { env: { ...process.env, CRON_SECRET: secret, WORKER_APP_URL: `http://127.0.0.1:${server.address().port}`, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill(), 15000);
  try { return { code: await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }), output }; }
  finally { clearTimeout(timer); }
}
try {
  const invalid = await tick('start.mjs', { CRON_SECRET: 'invalid' });
  assert.equal(invalid.code, 1, invalid.output);
  assert.match(invalid.output, /Set CRON_SECRET/);
  assert.equal(requests.length, 0, 'invalid supervisor config must not start the worker');
  const first = await tick(); assert.equal(first.code, 0, first.output);
  assert.deepEqual(requests, [{ method: 'POST', path: '/api/worker', authorization: `Bearer ${secret}` }]);
  responseStatus = 503; const second = await tick(); assert.equal(second.code, 1, second.output);
  assert.equal(requests.length, 2); assert(!first.output.includes(secret) && !second.output.includes(secret));
  console.log('Worker checks passed: configuration validation, graceful request drain, one-shot authentication, failure reporting, and no secret output. No database or email service was used.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
