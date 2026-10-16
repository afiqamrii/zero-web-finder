// Optional live, public Google Maps check. Uses only the isolated preview.
// No campaigns are approved and no email is sent.
import { request } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const access = JSON.parse(await readFile('.local/preview-access.json', 'utf8'));
assert.equal(new URL(access.url).hostname, '127.0.0.1');
const api = await request.newContext({ baseURL: access.url, extraHTTPHeaders: { Origin: access.url } });
try {
  assert.equal((await api.post('/api/session', { data: { password: access.password } })).status(), 200);
  const dashboard = await (await api.get('/api/dashboard')).json();
  assert.equal(dashboard.preview, true); assert.equal(dashboard.settings.sendingEnabled, false);
  for (const job of (await (await api.get('/api/automation')).json()).jobs) if (job.enabled) await api.patch('/api/automation', { data: { id: job.id, action: 'pause' } });
  const reports = [];
  for (const category of ['Dental clinic', 'Tailor']) {
    const queued = await api.post('/api/search', { data: { city: 'Petaling Jaya', category, limit: 1, mode: 'no_website', intervalHours: 0 } });
    assert.equal(queued.status(), 202);
    const start = performance.now();
    const response = await api.post('/api/automation', { timeout: 290000 });
    const result = await response.json();
    const jobs = (await (await api.get('/api/automation')).json()).jobs;
    const job = jobs.find(job => job.city === 'Petaling Jaya' && job.category === category);
    const report = { category, httpStatus: response.status(), elapsedSeconds: Math.round((performance.now() - start) / 1000), result, status: job?.status, resultCount: job?.resultCount, error: job?.error };
    reports.push(report);
    await writeFile('test-results/discovery-report.json', JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert.equal(response.status(), 200); assert.equal(result.sent, 0); assert.equal(job?.status, 'COMPLETED');
  }
} finally { await api.dispose(); }
