import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { previewAccessPath } from './preview-location.mjs';

const access = JSON.parse(await readFile(previewAccessPath, 'utf8'));
assert.equal(new URL(access.url).hostname, '127.0.0.1');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(20000);
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
async function request(path, method = 'GET', data) {
  const response = await page.request.fetch(access.url + path, { method, data, headers: { Origin: access.url } });
  assert(response.ok(), `${method} ${path}: ${response.status()}`);
  return response.json();
}
const nav = label => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label, exact: true }).click();
async function screenshot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: await page.getByRole('dialog').count() === 0, animations: 'disabled' });
}
const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must fit the viewport');

try {
  await mkdir('test-results', { recursive: true });
  for (const path of ['/api/insights', '/api/tasks', '/api/pipeline']) assert.equal((await page.request.get(access.url + path)).status(), 401);
  await page.goto(access.url);
  await page.getByLabel('Workspace password').fill(access.password);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('heading', { name: 'Your next project starts here.' }).waitFor();
  const initial = await request('/api/dashboard');
  assert(initial.preview); assert.equal(initial.settings.sendingEnabled, false);
  checks.push('New APIs require owner access; isolated workspace keeps sending off');

  const runId = crypto.randomUUID().slice(0, 8);
  const name = `Kedai Mekar (demo ${runId})`, email = `growth-${runId}@example.com`;
  const csv = `name,category,address,email,source\n${name},Café,Petaling Jaya,${email},Confirmed: browser test fixture\nDuplicate Café,Café,Penang,${email},Fixture\nInvalid Café,Café,Penang,invalid email,Fixture`;
  await nav('Lead workspace');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await page.getByLabel('Or paste CSV contents', { exact: true }).fill(csv);
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await page.getByRole('button', { name: 'Import 1 new leads', exact: true }).waitFor();
  assert.equal((await request('/api/leads?q=' + encodeURIComponent(email))).total, 0);
  await page.getByLabel('Choose lead CSV file').setInputFiles({ name: 'too-large.csv', mimeType: 'text/csv', buffer: Buffer.alloc(120001) });
  await page.getByRole('alert').filter({ hasText: '120 KB' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Import 1 new leads', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Or paste CSV contents', { exact: true }).inputValue(), '');
  await page.getByLabel('Or paste CSV contents', { exact: true }).fill(csv);
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await page.getByRole('button', { name: 'Import 1 new leads', exact: true }).click();
  await page.getByText('1 new business imported', { exact: true }).waitFor();
  await screenshot('growth-import-preview');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  let lead = (await request('/api/leads?q=' + encodeURIComponent(email))).leads[0];
  assert(lead); assert.equal(lead.emailVerified, false);
  const replay = await request('/api/leads/import', 'POST', { csv, dryRun: false });
  assert.equal(replay.summary.imported, 0);
  checks.push('CSV previews without writes, clears rejected-file previews, skips bad/duplicate rows, and safely replays');

  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await page.getByRole('dialog', { name }).getByRole('checkbox').check();
  await page.getByLabel('Deal value (MYR)', { exact: true }).fill('1499');
  await page.getByRole('button', { name: 'Save lead', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  lead = (await request('/api/leads/' + lead.id)).lead; assert(lead.emailVerified);
  await nav('Opportunity studio');
  await page.getByRole('button', { name: 'Analyze ' + name, exact: true }).click();
  await page.getByRole('heading', { name: 'The score, explained' }).waitFor();
  const intro = page.getByLabel('Introduction draft', { exact: true });
  assert((await intro.inputValue()).includes(name));
  await intro.fill('My personalized draft for ' + name);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: access.url });
  await page.getByRole('button', { name: 'Copy introduction', exact: true }).click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes('My personalized draft'));
  await page.getByRole('button', { name: 'Project brief', exact: true }).click();
  assert((await page.getByLabel('Working project brief', { exact: true }).inputValue()).includes('not agreed'));
  await screenshot('growth-analysis-detail');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await screenshot('growth-studio-desktop');
  checks.push('Local analysis explains score and evidence; personalized introduction and project brief copy correctly');

  await nav('Pipeline & tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Attach to a lead', { exact: true }).selectOption(lead.id);
  await page.getByLabel('What is the next step?', { exact: true }).fill('Prepare Kedai website outline');
  const dueAt = new Date(Date.now() - 3600000); dueAt.setUTCSeconds(0, 0);
  const localTime = new Date(dueAt.getTime() + 8 * 3600000).toISOString().slice(0, 16);
  await page.getByLabel('Due date and time · Malaysia (UTC+8)', { exact: true }).fill(localTime);
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let tasks = await request('/api/tasks?leadId=' + lead.id); assert.equal(tasks.total, 1); assert.equal(tasks.tasks[0].dueAt, dueAt.toISOString());
  await page.getByRole('button', { name: 'My tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Complete task: Prepare Kedai website outline', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Complete task: Prepare Kedai website outline', exact: true }).click();
  await page.getByText('Task completed. One less thing to remember.', { exact: true }).waitFor();
  await page.getByLabel('Task view', { exact: true }).selectOption('DONE');
  await page.getByRole('button', { name: 'Reopen task: Prepare Kedai website outline', exact: true }).click();
  await page.getByText('Task reopened.', { exact: true }).waitFor();
  assert.equal((await request('/api/tasks?leadId=' + lead.id)).tasks[0].status, 'OPEN');
  await page.getByRole('button', { name: 'Pipeline board', exact: true }).click();
  await page.getByLabel('Stage for ' + name, { exact: true }).selectOption('WON');
  await page.getByText(/moved to Won/).waitFor();
  lead = (await request('/api/leads/' + lead.id)).lead;
  assert.equal(lead.status, 'WON'); assert.equal(lead.revenueCents, 0);
  await screenshot('growth-pipeline-desktop');
  checks.push('MYT task persists through reload, completes/reopens, and moving Won records no fictional payment');

  await nav('Overview');
  await page.getByRole('button', { name: /Overdue follow-up tasks/ }).click();
  await page.getByRole('button', { name: 'Complete task: Prepare Kedai website outline', exact: true }).waitFor();
  await nav('Overview');
  await page.keyboard.press('Control+k');
  const search = page.getByLabel('Find a lead or page', { exact: true });
  assert(await search.evaluate(element => element === document.activeElement));
  await search.fill(email);
  const match = page.getByRole('dialog').getByRole('button', { name: new RegExp(runId) });
  await match.waitFor(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await nav('Overview'); await screenshot('growth-dashboard-desktop');
  checks.push('Dashboard opens overdue work; keyboard quick search opens the exact lead');

  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(); await screenshot('growth-dashboard-mobile');
  for (const [label, imageName] of [['Opportunity studio', 'growth-studio-mobile'], ['Pipeline & tasks', 'growth-pipeline-mobile']]) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click(); await nav(label);
    await page.getByRole('heading', { level: 1 }).waitFor();
    if (label === 'Opportunity studio') await page.getByRole('button', { name: 'Recalculate', exact: true }).waitFor();
    else await page.getByLabel('Stage for ' + name, { exact: true }).waitFor();
    await noOverflow(); await screenshot(imageName);
  }
  checks.push('Desktop and 390px mobile layouts fit without page overflow');
  assert.deepEqual(errors, []);
  await writeFile('test-results/growth-report.json', JSON.stringify({ checks, errors, previewOnly: true, emailsSent: 0 }, null, 2));
  console.log(JSON.stringify({ checks, errors, screenshots: 'test-results/growth-*.png' }, null, 2));
} catch (error) {
  await screenshot('growth-failure');
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
