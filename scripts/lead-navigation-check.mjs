import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run against scripts/preview.mjs only; never use production credentials or data.
const { previewAccessPath } = await import('./preview-location.mjs');
const access = JSON.parse(await readFile(previewAccessPath, 'utf8'));
assert.equal(new URL(access.url).hostname, '127.0.0.1');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(access.url);
  await page.getByLabel('Workspace password').fill(access.password);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.waitForURL(url => url.pathname === '/');
  const dashboard = await page.request.get(`${access.url}/api/dashboard`);
  assert.equal((await dashboard.json()).preview, true, 'Only an isolated preview is allowed');
  const query = page.getByLabel('Search leads'), stage = page.getByLabel('Filter stage'), sort = page.getByLabel('Sort leads');
  async function values(q, s, order) {
    await page.waitForFunction(([q, s, order]) => document.querySelector('[aria-label="Search leads"]')?.value === q && document.querySelector('[aria-label="Filter stage"]')?.value === s && document.querySelector('[aria-label="Sort leads"]')?.value === order, [q, s, order]);
    assert.equal(await query.inputValue(), q); assert.equal(await stage.inputValue(), s); assert.equal(await sort.inputValue(), order);
  }
  await page.goto(`${access.url}/?tab=leads&status=WON&q=older-search&sort=value&page=2`);
  await values('older-search', 'WON', 'value');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Lead workspace', exact: true }).click();
  await page.waitForURL(url => url.search === '?tab=leads');
  await values('', 'ALL', 'priority');
  await page.goBack();
  await values('older-search', 'WON', 'value');
  await page.goForward();
  await values('', 'ALL', 'priority');
  await query.fill('updated-search');
  await page.waitForURL(url => url.searchParams.get('q') === 'updated-search');
  await stage.selectOption('REPLIED'); await sort.selectOption('name');
  await values('updated-search', 'REPLIED', 'name');
  await page.reload();
  await values('updated-search', 'REPLIED', 'name');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  await values('', 'ALL', 'priority');
  console.log('Lead navigation passed: sidebar reset, browser Back/Forward, debounced search, filter persistence, reload, and clear filters. No client data or email accessed.');
} finally { await browser.close(); }
