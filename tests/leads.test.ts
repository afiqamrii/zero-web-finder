import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { localPostgres } from './local-postgres.mjs';
let local: Awaited<ReturnType<typeof localPostgres>>;
let db: typeof import('@/lib/prisma').prisma;
let list: typeof import('@/app/api/leads/route').GET;
let create: typeof import('@/app/api/leads/route').POST;
let patch: typeof import('@/app/api/leads/[id]/route').PATCH;
let detail: typeof import('@/app/api/leads/[id]/route').GET;
let exportCsv: typeof import('@/app/api/leads/export/route').GET;
const request = (params = '') => new Request(`https://workspace.test/api/leads?${params}`);
const body = (value: unknown) => new Request('https://workspace.test/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeAll(async () => {
  local = await localPostgres();
  process.env.DATABASE_URL = local.url; process.env.DIRECT_URL = local.url;
  ({ prisma: db } = await import('@/lib/prisma'));
  ({ GET: list, POST: create } = await import('@/app/api/leads/route'));
  ({ GET: detail, PATCH: patch } = await import('@/app/api/leads/[id]/route'));
  ({ GET: exportCsv } = await import('@/app/api/leads/export/route'));
});
beforeEach(async () => { await db.$executeRawUnsafe('TRUNCATE "EmailMessage", "Enrollment", "Campaign", "Lead", "Suppression", "Activity" CASCADE'); });
afterAll(async () => { await db?.$disconnect(); await local?.close(); });
const lead = (id: string, data = {}) => db.lead.create({ data: { id, placeId: id, name: `Business ${id}`, address: 'Petaling Jaya', category: 'Café', mapsUrl: '', email: `${id}@example.com`, emailVerified: true, emailSource: 'Business website', ...data } });

describe('lead workspace', () => {
  it('shows outreach readiness only for new verified sourced contacts without suppression or prior enrollment', async () => {
    await lead('ready'); await lead('unverified', { emailVerified: false }); await lead('nosource', { emailSource: '' }); await lead('contacted', { status: 'CONTACTED' });
    await lead('optout', { optedOutAt: new Date() }); await lead('blocked'); await db.suppression.create({ data: { email: 'blocked@example.com', reason: 'Opted out' } });
    await lead('enrolled'); await lead('shared', { email: 'enrolled@example.com' });
    const campaign = await db.campaign.create({ data: { name: 'Existing campaign', subject: 'Hello', body: 'Hello' } });
    await db.enrollment.create({ data: { campaignId: campaign.id, leadId: 'enrolled', email: 'enrolled@example.com' } });
    const result = await (await list(request('view=READY'))).json();
    expect(result.leads.map((l: { id: string }) => l.id)).toEqual(['ready']);
    const research = await (await list(request('view=UNVERIFIED'))).json();
    expect(research.leads.map((l: { id: string }) => l.id).sort()).toEqual(['nosource', 'unverified']);
  });
  it('exports the same filtered audience and order across pages, with formula-safe cells', async () => {
    await lead('alpha', { name: '=Alpha Cafe', isStarred: true, dealValueCents: 10000 });
    await lead('beta', { name: 'Beta Cafe', isStarred: true, dealValueCents: 20000 });
    await lead('other', { name: 'Other Cafe', isStarred: false });
    await lead('won', { name: 'Won Cafe', isStarred: true, status: 'WON' });
    const params = 'view=STARRED&status=NEW&q=cafe&sort=value';
    const page = await (await list(request(params))).json();
    expect(page.leads.map((l: { id: string }) => l.id)).toEqual(['beta', 'alpha']);
    const csv = await (await exportCsv(request(params + '&page=2'))).text();
    expect(csv).toContain('"\'=Alpha Cafe"'); expect(csv).not.toContain('Other Cafe'); expect(csv).not.toContain('Won Cafe');
    expect(csv.indexOf('Beta Cafe')).toBeLessThan(csv.indexOf('Alpha Cafe'));
  });
  it('clamps an out-of-range page to the last available page and rejects unknown filters', async () => {
    for (let i = 0; i < 26; i++) await lead(`p${i}`);
    const result = await (await list(request('page=999'))).json();
    expect(result.page).toBe(2); expect(result.pages).toBe(2); expect(result.leads).toHaveLength(1);
    expect((await list(request('view=INVALID'))).status).toBe(400);
    expect((await exportCsv(request('status=INVALID'))).status).toBe(400);
  });
  it('edits business details, recalculates score and returns a directly addressable lead', async () => {
    await lead('edit');
    const response = await patch(body({ name: 'Updated business', phone: '+60123456789', address: 'Shah Alam', category: 'Dentist', websiteUrl: 'https://example.com', leadType: 'OUTDATED_WEBSITE' }), context('edit'));
    expect(response.status).toBe(200);
    const result = await (await detail(request(), context('edit'))).json();
    expect(result.lead.name).toBe('Updated business'); expect(result.lead.websiteUrl).toBe('https://example.com'); expect(result.lead.score).toBe(60);
    expect((await patch(body({ websiteUrl: 'javascript:alert(1)' }), context('edit'))).status).toBe(400);
    expect((await detail(request(), context('missing'))).status).toBe(404);
  });
  it('rejects changing a lead email to an existing mailbox regardless of casing', async () => {
    await lead('one'); await lead('two');
    expect((await patch(body({ email: 'ONE@EXAMPLE.COM' }), context('two'))).status).toBe(409);
    expect((await create(body({ name: 'New', category: 'Café', email: ' One@Example.Com ' }))).status).toBe(409);
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'two' } })).email).toBe('two@example.com');
  });
  it('normalizes legacy emails when explicitly verified and rejects invalid legacy contact data', async () => {
    await lead('legacy', { email: ' Legacy@Example.Com ', emailVerified: false });
    expect((await patch(body({ emailVerified: true }), context('legacy'))).status).toBe(200);
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'legacy' } })).email).toBe('legacy@example.com');
    await lead('invalid', { email: 'not-an-email', emailVerified: false });
    expect((await patch(body({ emailVerified: true }), context('invalid'))).status).toBe(400);
    await lead('source', { emailSource: '   ', emailVerified: false });
    expect((await patch(body({ emailVerified: true }), context('source'))).status).toBe(400);
    expect((await patch(body({ email: '', emailVerified: true }), context('legacy'))).status).toBe(400);
  });
  it('clears verification when the email identity changes and saves new website details', async () => {
    await lead('change');
    expect((await patch(body({ email: 'new@example.com' }), context('change'))).status).toBe(200);
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'change' } })).emailVerified).toBe(false);
    const result = await create(body({ name: 'Added cafe', category: 'Café', websiteUrl: 'https://example.com' }));
    expect(result.status).toBe(201); expect((await result.json()).lead.websiteUrl).toBe('https://example.com');
  });
  it('preserves a worker stage update when an older editor snapshot is saved', async () => {
    const original = await lead('concurrent');
    await db.lead.update({ where: { id: original.id }, data: { status: 'CONTACTED', updatedAt: new Date(original.updatedAt.getTime() + 1000) } });
    const response = await patch(body({ expectedUpdatedAt: original.updatedAt.toISOString(), status: 'NEW', notes: 'Stale notes' }), context(original.id));
    expect(response.status).toBe(409);
    const current = await db.lead.findUniqueOrThrow({ where: { id: original.id } });
    expect(current.status).toBe('CONTACTED'); expect(current.notes).toBeNull();
    expect((await patch(body({ expectedUpdatedAt: current.updatedAt.toISOString(), notes: 'Fresh notes' }), context(original.id))).status).toBe(200);
  });
});
