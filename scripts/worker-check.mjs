import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const secret = randomBytes(32).toString('hex');
const requests = [];
let responseStatus = 200;
const server = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url, authorization: req.headers.authorization });
  res.writeHead(responseStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ sent: 0, discovered: 0 }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
async function tick() {
  const child = spawn(process.execPath, ['scripts/worker.mjs', '--once'], { env: { ...process.env, CRON_SECRET: secret, WORKER_APP_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill(), 15000);
  try { return { code: await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }), output }; }
  finally { clearTimeout(timer); }
}
try {
  const first = await tick(); assert.equal(first.code, 0, first.output);
  assert.deepEqual(requests, [{ method: 'POST', path: '/api/worker', authorization: `Bearer ${secret}` }]);
  responseStatus = 503; const second = await tick(); assert.equal(second.code, 1, second.output);
  assert.equal(requests.length, 2); assert(!first.output.includes(secret) && !second.output.includes(secret));
  console.log('Worker process checks passed: starts, authenticates one request, reports failure, and does not print secrets. No database or email service was used.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
