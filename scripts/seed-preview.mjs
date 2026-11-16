import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { previewAccessPath } from './preview-location.mjs';

const access = JSON.parse(await readFile(previewAccessPath, 'utf8'));
assert.equal(new URL(access.url).hostname, '127.0.0.1');
const login = await fetch(access.url + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: access.url }, body: JSON.stringify({ password: access.password }) });
assert(login.ok, 'Could not sign into local preview');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
async function request(path, method = 'GET', body) {
  const response = await fetch(access.url + path, { method, headers: { Cookie: cookie, Origin: access.url, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
const overview = await request('/api/dashboard');
assert(overview.preview && !overview.settings.sendingEnabled, 'Samples may only be added to a disconnected temporary preview');
const samples = [
  { name: 'Kopi Awan (sample)', category: 'Café', address: 'Kuala Lumpur', email: 'kopi-awan@example.com', emailVerified: true, status: 'NEW', value: 149900 },
  { name: 'Studio Reka Baru (sample)', category: 'Design studio', address: 'Petaling Jaya', email: 'studio-reka@example.com', emailVerified: true, status: 'REPLIED', value: 249900 },
  { name: 'Dapur Melur (sample)', category: 'Restaurant', address: 'Shah Alam', email: '', emailVerified: false, status: 'NEW', value: 0 },
  { name: 'Salun Seri (sample)', category: 'Salon', address: 'Kajang', email: 'salun-seri@example.com', emailVerified: true, status: 'PROPOSAL_SENT', value: 199900 },
];
let added = 0;
for (const sample of samples) {
  const existing = await request('/api/leads?' + new URLSearchParams({ q: sample.name }));
  if (existing.leads.some(lead => lead.name === sample.name)) continue;
  const { lead } = await request('/api/leads', 'POST', { name: sample.name, category: sample.category, address: sample.address, email: sample.email, emailVerified: sample.emailVerified, emailSource: sample.email ? 'Fictional sample for this temporary preview' : '' });
  await request('/api/leads/' + lead.id, 'PATCH', { status: sample.status, dealValueCents: sample.value, isStarred: sample.status === 'REPLIED', notes: 'Sample record to explore the workspace. This is not an actual client.' });
  if (sample.status === 'REPLIED' || sample.status === 'PROPOSAL_SENT') await request('/api/tasks', 'POST', { leadId: lead.id, title: sample.status === 'REPLIED' ? 'Clarify website goals (sample)' : 'Review proposal next steps (sample)', dueAt: new Date(Date.now() + (sample.status === 'REPLIED' ? -1 : 24) * 3600000).toISOString() });
  added++;
}
console.log(`Added ${added} fictional sample businesses to the temporary preview. No messages sent.`);
