import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { previewAccessPath } = await import('./preview-location.mjs');
const access = JSON.parse(await readFile(previewAccessPath, 'utf8'));
assert.equal(new URL(access.url).hostname, '127.0.0.1');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
const nav = label => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label, exact: true }).click();
async function request(path, method = 'GET', data) {
  const response = await page.request.fetch(access.url + path, { method, data, headers: { Origin: access.url } });
  assert(response.ok(), `${method} ${path} failed: ${response.status()}`);
  return response.json();
}
async function create(name, verified = true) {
  const { lead } = await request('/api/leads', 'POST', { name, address: 'Petaling Jaya', category: 'Café', email: `sample-${crypto.randomUUID()}@example.com`, emailSource: verified ? 'Fictional browser test fixture' : '', emailVerified: verified });
  return lead;
}
try {
  await mkdir('test-results', { recursive: true });
  assert.equal((await page.request.get(access.url + '/api/activity')).status(), 401);
  await page.goto(access.url);
  await page.getByLabel('Workspace password').fill(access.password);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('heading', { name: 'Your next project starts here.' }).waitFor();
  const initial = await request('/api/dashboard');
  assert.equal(initial.preview, true); assert.equal(initial.settings.sendingEnabled, false);
  const ready = await create('Kopi Pagi (demo)');
  const research = await create('Selera Corner (demo)', false);
  const replied = await create('Studio Reka (demo)');
  await request('/api/leads/' + replied.id, 'PATCH', { status: 'REPLIED', dealValueCents: 249900 });
  await request('/api/leads/' + ready.id, 'PATCH', { isStarred: true, dealValueCents: 149900 });
  await page.reload();
  await page.getByRole('button', { name: 'Open priority lead ' + ready.name }).click();
  await page.getByRole('dialog', { name: ready.name }).waitFor();
  assert(new URL(page.url()).searchParams.get('lead') === ready.id);
  const verified = page.getByRole('checkbox');
  assert.equal(await verified.isChecked(), true);
  await page.getByLabel('Business email', { exact: true }).fill('changed@example.com');
  assert.equal(await verified.isChecked(), false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('Priority lead opens exact record; email edits reset verification');

  await nav('Overview');
  await page.getByRole('button', { name: /Contacts to verify/ }).click();
  await page.getByRole('button', { name: 'Open ' + research.name, exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open ' + ready.name, exact: true }).count(), 0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export view', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = ''; for await (const chunk of stream) csv += chunk;
  assert(csv.includes(research.name)); assert(!csv.includes(ready.email));
  checks.push('Attention link filters leads; exported CSV uses same filter');

  await nav('Settings');
  const offer = page.getByLabel('Your offer', { exact: true });
  await offer.fill('Browser test draft — kept across navigation');
  await nav('Overview'); await nav('Settings');
  await offer.waitFor(); assert.equal(await offer.inputValue(), 'Browser test draft — kept across navigation');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByText('Settings saved.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  assert.equal(await offer.inputValue(), 'Browser test draft — kept across navigation');
  assert.equal((await request('/api/settings')).settings.offer, 'Browser test draft — kept across navigation');
  checks.push('Settings draft survives tab changes; save reaches database and remains confirmed');

  await nav('Activity & delivery');
  await page.getByRole('heading', { name: 'Email history' }).waitFor();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('delivery') === 'REVIEW');
  await page.reload();
  await page.getByRole('button', { name: 'Review', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Review', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('heading', { name: 'No messages match this view' }).waitFor();
  checks.push('Delivery filter survives reload; empty history is useful');

  await nav('Overview');
  await page.getByRole('heading', { name: 'Next actions', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/dashboard-refined-desktop.png', fullPage: true });
  const timings = [];
  for (let index = 0; index < 5; index++) { const start = performance.now(); await request('/api/dashboard'); timings.push(Math.round(performance.now() - start)); }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/dashboard-refined-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  assert.equal(await page.locator('.workspace-main').evaluate(element => element.inert), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByRole('button', { name: 'Open navigation' }).evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('.sidebar .brand').click();
  await page.waitForFunction(() => !document.querySelector('.workspace-main').inert);
  checks.push('Mobile menu traps focus, closes with Escape/brand, and restores content');

  await page.getByRole('button', { name: 'Open navigation' }).click(); await nav('Lead workspace');
  await page.getByRole('button', { name: 'Open ' + ready.name, exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/leads-refined-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Open ' + ready.name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: ready.name });
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  await page.mouse.click(box.x + 2, box.y + 80);
  assert.equal(await dialog.isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  checks.push('Mobile lead cards do not overflow; dialog padding is safe and Escape works');
  assert.deepEqual(errors, []);
  await writeFile('test-results/workspace-report.json', JSON.stringify({ passed: true, checks, dashboardResponseMs: timings, errors }, null, 2));
  console.log('Workspace browser checks passed:', checks.length, 'flows. Dashboard response times (ms):', timings.join(', '));
} catch (error) {
  await page.screenshot({ path: 'test-results/workspace-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
