import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { localPostgres } from './local-postgres.mjs';
vi.mock('@/lib/email', async importOriginal => { const original = await importOriginal<typeof import('@/lib/email')>(); return { ...original, sendEmail: vi.fn() }; });
vi.mock('@/lib/scraper', () => ({ scrapeGoogleMaps: vi.fn(async () => []) }));
let local: Awaited<ReturnType<typeof localPostgres>>;
let db: typeof import('@/lib/prisma').prisma;
let worker: typeof import('@/lib/automation').runAutomation;
let enroll: typeof import('@/lib/campaigns').enroll;
let send: typeof import('@/lib/email').sendEmail;
const request = (path: string, body: unknown) => new Request(`https://workspace.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeAll(async () => {
  local = await localPostgres({ seed: true });
  process.env.DATABASE_URL = local.url; process.env.DIRECT_URL = local.url;
  Object.assign(process.env, { OWNER_PASSWORD: 'test-only-password', AUTH_SECRET: 'test-secret-'.repeat(4), PUBLIC_APP_URL: 'https://workspace.test', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-provider-key', RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.from('test-webhook-signing-secret-12345678').toString('base64'), INBOUND_REPLY_DOMAIN: 'replies.workspace.test' });
  ({ prisma: db } = await import('@/lib/prisma'));
  ({ runAutomation: worker } = await import('@/lib/automation'));
  ({ enroll } = await import('@/lib/campaigns'));
  ({ sendEmail: send } = await import('@/lib/email'));
  expect((await db.lead.findUniqueOrThrow({ where: { id: 'legacy-test' } })).notes).toBe('Keep this original note');
  const rls = await db.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'Lead'`;
  expect(rls[0].relrowsecurity).toBe(true);
});
beforeEach(async () => {
  process.env.EMAIL_PROVIDER = 'resend';
  await db.$executeRawUnsafe('TRUNCATE "EmailMessage", "Enrollment", "Campaign", "Lead", "Suppression", "DiscoveryJob", "Activity", "WebhookEvent", "Workspace" CASCADE');
  await db.workspace.create({ data: { id: 'owner', senderName: 'Test Owner', senderEmail: 'owner@example.com', replyTo: 'owner@example.com', businessAddress: 'Test business address', sendingEnabled: true, sendStartHour: 0, sendEndHour: 24, weekdaysOnly: false, dailyLimit: 20 } });
  vi.mocked(send).mockReset(); vi.mocked(send).mockImplementation(async m => ({ id: `provider-${m.id}`, threadId: null }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(async () => { await db?.$disconnect(); await local?.close(); });
async function campaign(count = 1, approved = true) {
  const c = await db.campaign.create({ data: { name: 'Test campaign', subject: 'Hello {{business}}', body: 'A useful website idea for {{business}}.', status: approved ? 'ACTIVE' : 'DRAFT', approvedAt: approved ? new Date() : null, followUpBody: 'Following up with {{business}}.', followUpDays: 3 } });
  for (let i = 0; i < count; i++) await db.lead.create({ data: { placeId: `p${i}`, name: `Business ${i}`, address: 'Kuala Lumpur', mapsUrl: '', category: 'Café', email: `business${i}@example.com`, emailSource: 'Business website', emailVerified: true, score: 80 } });
  return c;
}
describe('real PostgreSQL automation flow', () => {
  it('keeps drafts unsent, enrolls once, and sends once across repeated ticks', async () => {
    const c = await campaign(1, false); expect(await enroll(c)).toBe(0); await worker(); expect(send).not.toHaveBeenCalled();
    const approved = await db.campaign.update({ where: { id: c.id }, data: { status: 'ACTIVE', approvedAt: new Date() } });
    expect(await enroll(approved)).toBe(1); expect(await enroll(approved)).toBe(0);
    await worker(); await worker(); expect(send).toHaveBeenCalledTimes(1); expect((await db.lead.findFirst())?.status).toBe('CONTACTED');
  });
  it('serializes overlapping workers and enforces the daily cap', async () => {
    const c = await campaign(3); await enroll(c); await db.workspace.update({ where: { id: 'owner' }, data: { dailyLimit: 1 } });
    await Promise.all([worker(), worker()]); expect(send).toHaveBeenCalledTimes(1); expect(await db.emailMessage.count({ where: { status: 'QUEUED' } })).toBe(2);
  });
  it('honors campaign pause and the master switch', async () => {
    const c = await campaign(); await enroll(c); await db.campaign.update({ where: { id: c.id }, data: { status: 'PAUSED' } }); await worker(); expect(send).not.toHaveBeenCalled();
    await db.campaign.update({ where: { id: c.id }, data: { status: 'ACTIVE' } }); await db.workspace.update({ where: { id: 'owner' }, data: { sendingEnabled: false } }); await worker(); expect(send).not.toHaveBeenCalled();
  });
  it('skips unverified, suppressed and previously enrolled addresses', async () => {
    const c = await campaign(3); await db.lead.update({ where: { placeId: 'p0' }, data: { emailVerified: false } }); await db.suppression.create({ data: { email: 'business1@example.com', reason: 'Opted out' } });
    expect(await enroll(c)).toBe(1); const c2 = await db.campaign.create({ data: { name: 'Other', subject: 'Hello', body: 'Hello', status: 'ACTIVE', approvedAt: new Date() } }); expect(await enroll(c2)).toBe(0);
  });
  it('unsubscribes idempotently and cancels queued outreach', async () => {
    const c = await campaign(); await enroll(c); const e = await db.enrollment.findFirstOrThrow(); const { POST } = await import('@/app/unsubscribe/route');
    const r = () => new Request(`https://workspace.test/unsubscribe?token=${e.token}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' });
    expect((await POST(r())).status).toBe(200); expect((await POST(r())).status).toBe(200); await worker(); expect(send).not.toHaveBeenCalled(); expect(await db.suppression.count()).toBe(1);
  });
  it('rechecks a changed lead before sending and rejects mass assignment', async () => {
    const c = await campaign(); await enroll(c); const lead = await db.lead.findFirstOrThrow(); const { PATCH } = await import('@/app/api/leads/[id]/route');
    expect((await PATCH(request('/api/leads', { placeId: 'tamper' }), { params: Promise.resolve({ id: lead.id }) })).status).toBe(400);
    expect((await PATCH(request('/api/leads', { status: 'REPLIED' }), { params: Promise.resolve({ id: lead.id }) })).status).toBe(200);
    await worker(); expect(send).not.toHaveBeenCalled(); expect((await db.enrollment.findFirst())?.status).toBe('REPLIED');
  });
  it('quarantines expired retries and uncertain Gmail sends', async () => {
    const c = await campaign(); await enroll(c); const message = await db.emailMessage.findFirstOrThrow();
    await db.emailMessage.update({ where: { id: message.id }, data: { status: 'RETRY', firstAttemptAt: new Date(Date.now() - 24 * 3600000) } }); await worker(); expect(send).not.toHaveBeenCalled(); expect((await db.emailMessage.findFirst())?.status).toBe('REVIEW');
    await db.emailMessage.update({ where: { id: message.id }, data: { provider: 'gmail', status: 'SENDING', updatedAt: new Date(Date.now() - 700000) } }); await worker(); expect((await db.emailMessage.findFirst())?.status).toBe('REVIEW');
  });
  it('processes signed delivery and reply events exactly once and rejects forgery', async () => {
    const c = await campaign(); await enroll(c); await worker(); const message = await db.emailMessage.findFirstOrThrow(); const e = await db.enrollment.findFirstOrThrow(); const { POST } = await import('@/app/api/webhooks/resend/route');
    function signed(id: string, payload: unknown) { const body = JSON.stringify(payload); const timestamp = String(Math.floor(Date.now() / 1000)); const signature = createHmac('sha256', Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.slice(6), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64'); return new Request('https://workspace.test/api/webhooks/resend', { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` } }); }
    const delivered = { type: 'email.delivered', data: { email_id: message.providerId } };
    expect((await POST(signed('event-1', delivered))).status).toBe(200); expect((await POST(signed('event-1', delivered))).status).toBe(200); expect(await db.webhookEvent.count()).toBe(1);
    expect((await POST(signed('event-2', { type: 'email.received', data: { from: e.email, to: [`reply+${e.token}@replies.workspace.test`] } }))).status).toBe(200);
    expect((await db.lead.findFirst())?.status).toBe('REPLIED'); expect((await POST(request('/webhook', delivered))).status).toBe(401);
  });
  it('creates only one follow-up and stops after a reply', async () => {
    const c = await campaign(); await enroll(c); await worker(); await db.workspace.update({ where: { id: 'owner' }, data: { followUpsEnabled: true } });
    await db.emailMessage.updateMany({ data: { status: 'DELIVERED', sentAt: new Date(Date.now() - 5 * 86400000) } });
    await worker(); await worker(); expect(send).toHaveBeenCalledTimes(2); expect(await db.emailMessage.count()).toBe(2);
  });
  it('returns paginated leads and dashboard values from saved records', async () => {
    await campaign(27); const { GET } = await import('@/app/api/leads/route'); const page1 = await (await GET(new Request('https://workspace.test/api/leads'))).json(); const page2 = await (await GET(new Request('https://workspace.test/api/leads?page=2'))).json(); expect(page1.leads).toHaveLength(25); expect(page2.leads).toHaveLength(2); expect(page1.total).toBe(27);
    const { GET: dashboard } = await import('@/app/api/dashboard/route'); const overview = await (await dashboard()).json(); expect(overview.revenue).toBe(0); expect(overview.verified).toBe(27);
  });
  it('keeps approved sender details frozen and does not expand a resumed one-time audience', async () => {
    const c = await campaign(1, false); const { PATCH, GET } = await import('@/app/api/campaigns/[id]/route');
    const context = { params: Promise.resolve({ id: c.id }) };
    expect((await PATCH(request('/campaign', { action: 'approve' }), context)).status).toBe(200);
    const original = await db.emailMessage.findFirstOrThrow();
    await PATCH(request('/campaign', { action: 'pause' }), context);
    await db.lead.create({ data: { placeId: 'new-match', name: 'Later contact', address: 'KL', mapsUrl: '', category: 'Cafe', email: 'later@example.com', emailVerified: true, emailSource: 'Business site', score: 80 } });
    await db.workspace.update({ where: { id: 'owner' }, data: { senderName: 'Changed owner', offer: 'Changed offer' } });
    expect((await PATCH(request('/campaign', { action: 'resume' }), context)).status).toBe(200);
    expect(await db.enrollment.count()).toBe(1); expect((await db.emailMessage.findFirstOrThrow()).body).toBe(original.body);
    const preview = await (await GET(request('/campaign', {}), context)).json(); expect(preview.sender).toContain('Test Owner');
  });
  it('detects a Gmail conversation reply and cancels its waiting follow-up', async () => {
    const c = await campaign(); await enroll(c); const first = await db.emailMessage.findFirstOrThrow(); const sentAt = new Date(Date.now() - 5 * 86400000);
    await db.emailMessage.update({ where: { id: first.id }, data: { provider: 'gmail', providerId: 'initial', threadId: 'thread-1', status: 'SENT', sentAt } });
    await db.emailMessage.create({ data: { enrollmentId: first.enrollmentId, step: 1, provider: 'gmail', recipient: first.recipient, sender: first.sender, replyTo: first.replyTo, subject: 'Follow-up', body: 'Hello', unsubscribeUrl: first.unsubscribeUrl } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('oauth2') ? Response.json({ access_token: 'test-only', expires_in: 3600 }) : Response.json({ messages: [{ id: 'initial' }, { id: 'reply-1', internalDate: String(Date.now()), payload: { headers: [{ name: 'From', value: `Business <${first.recipient}>` }] } }] })));
    const { checkGmailReplies } = await import('@/lib/gmail'); const checked = await checkGmailReplies();
    expect(checked.has(first.enrollmentId)).toBe(true); expect((await db.enrollment.findFirst())?.status).toBe('REPLIED'); expect((await db.lead.findFirst())?.status).toBe('REPLIED'); expect((await db.emailMessage.findFirst({ where: { step: 1 } }))?.status).toBe('CANCELLED');
  });
  it('stops a Gmail batch after an uncertain send and never retries it', async () => {
    process.env.EMAIL_PROVIDER = 'gmail'; Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: 'test-refresh' });
    const c = await campaign(2); await enroll(c); vi.mocked(send).mockRejectedValue(new Error('Connection interrupted'));
    await worker(); expect(send).toHaveBeenCalledTimes(1); expect(await db.emailMessage.count({ where: { status: 'REVIEW' } })).toBe(1); expect(await db.emailMessage.count({ where: { status: 'QUEUED' } })).toBe(1);
    await worker(); expect(await db.emailMessage.count({ where: { status: 'REVIEW' } })).toBe(2); expect(vi.mocked(send).mock.calls[0][0].id).not.toBe(vi.mocked(send).mock.calls[1][0].id);
  });
  it('requires a real contact source at enrollment and rechecks it before sending', async () => {
    const c = await campaign(4);
    await db.lead.update({ where: { placeId: 'p0' }, data: { emailSource: null } });
    await db.lead.update({ where: { placeId: 'p1' }, data: { emailSource: '' } });
    await db.lead.update({ where: { placeId: 'p2' }, data: { emailSource: '   ' } });
    expect(await enroll(c)).toBe(1);
    await db.lead.update({ where: { placeId: 'p3' }, data: { emailSource: '' } });
    await worker();
    expect(send).not.toHaveBeenCalled();
    expect((await db.emailMessage.findFirstOrThrow()).status).toBe('CANCELLED');
  });
  it('does not let disabled follow-ups block new introductions behind them', async () => {
    const c = await campaign(10); await enroll(c);
    const initial = await db.emailMessage.findMany();
    const earlier = new Date(Date.now() - 5 * 86400000);
    await db.emailMessage.updateMany({ data: { status: 'DELIVERED', sentAt: earlier } });
    for (const first of initial) await db.emailMessage.create({ data: { enrollmentId: first.enrollmentId, step: 1, provider: first.provider, recipient: first.recipient, sender: first.sender, replyTo: first.replyTo, subject: first.subject, body: 'Follow-up', unsubscribeUrl: first.unsubscribeUrl, scheduledAt: earlier } });
    await db.lead.create({ data: { placeId: 'new-introduction', name: 'New opportunity', address: 'KL', mapsUrl: '', category: 'Cafe', email: 'new@example.com', emailVerified: true, emailSource: 'Business site', score: 80 } });
    expect(await enroll(c)).toBe(1);
    await worker();
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(send).mock.calls[0][0].recipient).toBe('new@example.com');
    expect(await db.emailMessage.count({ where: { step: 1, status: 'QUEUED' } })).toBe(10);
  });
  it('previews the frozen enrolled messages after approval instead of a new audience', async () => {
    const c = await campaign(1, false); const { PATCH, GET } = await import('@/app/api/campaigns/[id]/route');
    const context = { params: Promise.resolve({ id: c.id }) };
    expect((await PATCH(request('/campaign', { action: 'approve' }), context)).status).toBe(200);
    const frozen = await db.emailMessage.findFirstOrThrow();
    await db.lead.update({ where: { placeId: 'p0' }, data: { name: 'Changed business name' } });
    await db.lead.create({ data: { placeId: 'new-match', name: 'Later contact', address: 'KL', mapsUrl: '', category: 'Cafe', email: 'later@example.com', emailVerified: true, emailSource: 'Business site', score: 80 } });
    const preview = await (await GET(request('/campaign', {}), context)).json();
    expect(preview).toMatchObject({ audience: 'enrolled', total: 1, potentialTotal: 1 });
    expect(preview.previews).toHaveLength(1);
    expect(preview.previews[0]).toMatchObject({ email: frozen.recipient, subject: frozen.subject, body: frozen.body, includesSignature: true, status: 'QUEUED', unsubscribeUrl: frozen.unsubscribeUrl });
  });
  it('accepts only one concurrent approval and preserves the reviewed audience', async () => {
    const c = await campaign(1, false); const { PATCH } = await import('@/app/api/campaigns/[id]/route');
    const context = { params: Promise.resolve({ id: c.id }) };
    const responses = await Promise.all([PATCH(request('/campaign', { action: 'approve' }), context), PATCH(request('/campaign', { action: 'approve' }), context)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await db.enrollment.count()).toBe(1);
    expect(await db.emailMessage.count()).toBe(1);
  });
  it('rejects a stale campaign action without overwriting a newer state', async () => {
    const c = await campaign();
    const stale = await db.campaign.update({ where: { id: c.id }, data: { status: 'PAUSED' } });
    await db.campaign.update({ where: { id: c.id }, data: { status: 'ACTIVE' } });
    vi.spyOn(db.campaign, 'findUniqueOrThrow').mockResolvedValueOnce(stale);
    const { PATCH } = await import('@/app/api/campaigns/[id]/route');
    const response = await PATCH(request('/campaign', { action: 'resume' }), { params: Promise.resolve({ id: c.id }) });
    expect(response.status).toBe(409);
    expect(await db.enrollment.count()).toBe(0);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('ACTIVE');
  });
  it('rejects a stale discovery pause after a worker claims the search', async () => {
    const stale = await db.discoveryJob.create({ data: { city: 'KL', category: 'Cafe' } });
    await db.discoveryJob.update({ where: { id: stale.id }, data: { status: 'RUNNING', lastRunAt: new Date() } });
    vi.spyOn(db.discoveryJob, 'findUniqueOrThrow').mockResolvedValueOnce(stale);
    const { PATCH } = await import('@/app/api/automation/route');
    const response = await PATCH(request('/automation', { id: stale.id, action: 'pause' }));
    expect(response.status).toBe(409);
    expect(await db.discoveryJob.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: 'RUNNING', enabled: true });
  });
  it('excludes legacy mixed-case suppressed addresses and deduplicates canonical mailboxes', async () => {
    const c = await campaign(3);
    await db.lead.update({ where: { placeId: 'p0' }, data: { email: 'BUSINESS0@EXAMPLE.COM' } });
    await db.suppression.create({ data: { email: 'business0@example.com', reason: 'Opted out' } });
    await db.lead.update({ where: { placeId: 'p1' }, data: { email: 'Shared@Example.com' } });
    await db.lead.update({ where: { placeId: 'p2' }, data: { email: 'shared@example.com' } });
    const { audienceWhere, unavailableEmails } = await import('@/lib/campaigns');
    expect(await db.lead.count({ where: audienceWhere(c, await unavailableEmails()) })).toBe(2);
    expect(await enroll(c)).toBe(1);
    expect((await db.emailMessage.findFirstOrThrow()).recipient).toBe('shared@example.com');
    await db.suppression.create({ data: { email: 'SHARED@EXAMPLE.COM', reason: 'Legacy suppression' } });
    await worker();
    expect(send).not.toHaveBeenCalled();
    expect((await db.emailMessage.findFirstOrThrow()).status).toBe('CANCELLED');
  });
  it('suppresses legacy mixed-case records together without duplicate suppression entries', async () => {
    const c = await campaign(); await enroll(c);
    await db.lead.update({ where: { placeId: 'p0' }, data: { email: 'BUSINESS0@EXAMPLE.COM' } });
    await db.suppression.create({ data: { email: 'Business0@Example.com', reason: 'Legacy opt-out' } });
    const { suppress } = await import('@/lib/suppression');
    await suppress(' BUSINESS0@EXAMPLE.COM ', 'Opted out');
    expect(await db.suppression.count()).toBe(1);
    expect((await db.lead.findFirstOrThrow()).status).toBe('DO_NOT_CONTACT');
    expect((await db.enrollment.findFirstOrThrow()).status).toBe('STOPPED');
    expect((await db.emailMessage.findFirstOrThrow()).status).toBe('CANCELLED');
  });
  it('keeps discovery running while Gmail reply checks fail and holds all email', async () => {
    process.env.EMAIL_PROVIDER = 'gmail';
    Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: 'test-refresh' });
    const c = await campaign(2); await enroll(c);
    const first = await db.emailMessage.findFirstOrThrow();
    await db.emailMessage.update({ where: { id: first.id }, data: { status: 'SENT', providerId: 'original', threadId: 'thread-1', sentAt: new Date(Date.now() - 3 * 86400000) } });
    const job = await db.discoveryJob.create({ data: { city: 'KL', category: 'Cafe' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Gmail is temporarily unavailable')));
    const result = await worker();
    expect(result).toMatchObject({ busy: false, sent: 0, warning: expect.stringContaining('reply checks') });
    expect(send).not.toHaveBeenCalled();
    expect((await db.discoveryJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('COMPLETED');
    expect((await db.workspace.findUniqueOrThrow({ where: { id: 'owner' } })).lastWorkerError).toContain('reply checks');
    await worker();
    expect(await db.activity.count({ where: { kind: 'ERROR' } })).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});
