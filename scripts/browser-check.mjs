import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { previewAccessPath } = await import('./preview-location.mjs');
const access = JSON.parse(await readFile(previewAccessPath, 'utf8'));
assert.equal(new URL(access.url).hostname, '127.0.0.1');
const label = `Browser QA Café ${Date.now()}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage(); const errors = []; const timings = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
try {
  assert.equal((await context.request.get(`${access.url}/api/leads`)).status(), 401);
  await page.goto(access.url); await page.getByLabel('Workspace password').fill(access.password); await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('heading', { name: 'Your next project starts here.' }).waitFor();
  const baseline = await (await context.request.get(`${access.url}/api/dashboard`)).json();
  assert.equal(baseline.preview, true); assert.equal(baseline.settings.sendingEnabled, false);
  await page.getByRole('button', { name: 'Lead workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Add lead', exact: true }).click();
  await page.getByLabel('Business name', { exact: true }).fill(label); await page.getByLabel('Business type', { exact: true }).fill('Café'); await page.getByLabel('City / address').fill('Petaling Jaya');
  await page.getByLabel('Business email', { exact: true }).fill(`qa${Date.now()}@example.com`); await page.getByLabel('Email source').fill('Browser test fixture only'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Add lead', exact: true }).last().click();
  await page.getByRole('button', { name: `Open ${label}`, exact: true }).click(); await page.getByLabel('Deal value (MYR)', { exact: true }).fill('1499'); await page.getByLabel('Collected revenue (MYR)').fill('500'); await page.getByLabel('Notes & next step').fill('Tested save and reload'); await page.getByRole('button', { name: 'Save lead', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const expectedRevenue = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', maximumFractionDigits: 0 }).format((baseline.revenue + 50000) / 100);
  await page.getByText(expectedRevenue, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Email campaigns', exact: true }).click(); await page.getByRole('button', { name: 'New campaign', exact: true }).click(); await page.getByLabel('Campaign name').fill('Browser QA introduction'); await page.getByRole('button', { name: 'Save & review' }).click(); await page.getByRole('heading', { name: 'Review your campaign' }).waitFor(); await page.getByRole('dialog').getByText(new RegExp(label)).first().waitFor(); assert.equal(await page.getByRole('button', { name: 'Approve campaign' }).isDisabled(), true); await page.getByRole('button', { name: 'Keep as draft' }).click();
  await page.getByRole('button', { name: 'Automations', exact: true }).click(); await page.getByRole('button', { name: 'New lead search', exact: true }).click(); await page.getByLabel('Business type', { exact: true }).fill('Café'); await page.getByRole('button', { name: 'Queue search', exact: true }).click(); await page.getByRole('cell', { name: 'queued', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByLabel('Sender email', { exact: true }).waitFor(); assert.equal(await page.getByLabel('Sender email', { exact: true }).inputValue(), 'afiqamri03@gmail.com');
  await page.getByRole('button', { name: 'Activity & delivery', exact: true }).click(); await page.getByRole('heading', { name: 'Workspace timeline' }).waitFor();
  const csrf = await context.request.patch(`${access.url}/api/leads/unknown`, { data: { status: 'WON' }, headers: { Origin: 'https://evil.test' } }); assert.equal(csrf.status(), 403);
  await mkdir('test-results', { recursive: true });
  await page.getByRole('button', { name: 'Overview', exact: true }).click(); await page.getByRole('heading', { name: 'Your next project starts here.' }).waitFor();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  for (let i = 0; i < 5; i++) { const start = performance.now(); const r = await context.request.get(`${access.url}/api/dashboard`); assert.equal(r.status(), 200); timings.push(Math.round(performance.now() - start)); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar')).visibility === 'hidden');
  assert.equal(await page.evaluate(() => { const card = document.querySelector('.automation-summary').getBoundingClientRect(); const stack = document.querySelector('.overview-columns > .stack:last-child').getBoundingClientRect(); return Math.abs(card.width - stack.width) < 2; }), true, 'Mobile status card does not stretch to its column');
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true, animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout overflows');
  await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('button', { name: 'Lead workspace', exact: true }).click(); await page.getByRole('button', { name: 'Add lead', exact: true }).click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile('test-results/browser-report.json', JSON.stringify({ passed: true, checks: ['private access', 'sign in', 'lead create/edit', 'pipeline and revenue', 'campaign personalization', 'blocked unconfigured sending', 'queued discovery', 'Gmail sender', 'delivery timeline', 'CSRF', 'mobile navigation', 'dialog keyboard close', 'no overflow', 'no runtime errors'], dashboardResponseMs: timings }, null, 2));
  console.log('Browser checks passed. Local dashboard API response times (ms):', timings.join(', '));
} catch (error) { await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/browser-failure.png', fullPage: true }); throw error; }
finally { await browser.close(); }
