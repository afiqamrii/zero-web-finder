import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { localPostgres } from './local-postgres.mjs';

let local: Awaited<ReturnType<typeof localPostgres>>;
let db: typeof import('@/lib/prisma').prisma;
let dashboard: typeof import('@/app/api/dashboard/route').GET;
let activity: typeof import('@/app/api/activity/route').GET;
let leads: typeof import('@/app/api/leads/route').GET;

beforeAll(async () => {
  local = await localPostgres();
  Object.assign(process.env, {
    DATABASE_URL: local.url, DIRECT_URL: local.url,
    OWNER_PASSWORD: 'test-owner-password', AUTH_SECRET: 'test-session-secret-'.repeat(3),
    CRON_SECRET: 'test-worker-secret-'.repeat(3), PUBLIC_APP_URL: 'https://workspace.test',
    EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-provider-key', RESEND_WEBHOOK_SECRET: 'test-webhook-key',
    INBOUND_REPLY_DOMAIN: 'replies.workspace.test',
  });
  // Reading dashboard/history must never call an email provider or public site.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request in dashboard tests'); }));
  ({ prisma: db } = await import('@/lib/prisma'));
  ({ GET: dashboard } = await import('@/app/api/dashboard/route'));
  ({ GET: activity } = await import('@/app/api/activity/route'));
  ({ GET: leads } = await import('@/app/api/leads/route'));
});

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "EmailMessage", "Enrollment", "Campaign", "Lead", "Suppression", "DiscoveryJob", "Activity", "WebhookEvent", "Workspace" CASCADE');
  await db.workspace.create({ data: {
    id: 'owner', senderName: 'Test Owner', senderEmail: 'owner@example.com', replyTo: 'owner@example.com',
    businessAddress: 'Test business address', sendingEnabled: true, dailyLimit: 20,
    sendStartHour: 0, sendEndHour: 24, weekdaysOnly: false, lastWorkerAt: new Date(),
  } });
});

afterAll(async () => { vi.unstubAllGlobals(); await db?.$disconnect(); await local?.close(); });

function leadRow(id: string, extra: Partial<Prisma.LeadCreateManyInput> = {}): Prisma.LeadCreateManyInput {
  return { id, placeId: `place-${id}`, name: `Business ${id}`, address: 'Kuala Lumpur', mapsUrl: '', category: 'Cafe',
    email: `${id}@example.com`, emailVerified: true, emailSource: 'Business website', score: 80, ...extra };
}

type MessageSeed = {
  id: string; status: string; name?: string; subject?: string; createdAt?: Date; sentAt?: Date | null;
};
async function seedMessages(campaignId: string, messages: MessageSeed[], options: { status?: string; name?: string } = {}) {
  const status = options.status ?? 'ACTIVE';
  await db.campaign.create({ data: { id: campaignId, name: options.name ?? campaignId, subject: 'Website introduction', body: 'A website introduction.', status, approvedAt: status === 'DRAFT' ? null : new Date() } });
  await db.lead.createMany({ data: messages.map(m => leadRow(`lead-${m.id}`, { email: `${m.id}@example.com`, name: m.name ?? `Business ${m.id}` })) });
  await db.enrollment.createMany({ data: messages.map(m => ({ id: `enrollment-${m.id}`, campaignId, leadId: `lead-${m.id}`, email: `${m.id}@example.com`, token: `token-${m.id}` })) });
  await db.emailMessage.createMany({ data: messages.map(m => ({ id: m.id, enrollmentId: `enrollment-${m.id}`, recipient: `${m.id}@example.com`, sender: 'Test Owner <owner@example.com>', replyTo: 'owner@example.com', subject: m.subject ?? 'Website introduction', body: 'Frozen message body', unsubscribeUrl: `https://workspace.test/unsubscribe?token=token-${m.id}`, provider: 'resend', status: m.status, createdAt: m.createdAt ?? new Date(), sentAt: m.sentAt ?? null })) });
}

async function history(query = '') {
  const response = await activity(new Request(`https://workspace.test/api/activity${query}`));
  expect(response.status).toBe(200);
  return response.json();
}

describe('dashboard data and complete delivery history', () => {
  it('shows only unfinished due tasks and splits overdue from the rest of the Malaysia day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T08:00:00Z'));
    try {
      await db.lead.create({ data: leadRow('task-lead') });
      await db.salesTask.createMany({ data: [
        { id: 'overdue', leadId: 'task-lead', title: 'Review client reply', dueAt: new Date('2026-11-16T07:59:00Z') },
        { id: 'later', leadId: 'task-lead', title: 'Prepare outline', dueAt: new Date('2026-11-16T15:59:00Z') },
        { id: 'tomorrow', leadId: 'task-lead', title: 'Tomorrow MYT', dueAt: new Date('2026-11-16T16:00:00Z') },
        { id: 'done', leadId: 'task-lead', title: 'Finished', dueAt: new Date('2026-11-16T07:00:00Z'), status: 'DONE', completedAt: new Date() },
      ] });
      const response = await dashboard(); expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.taskSummary).toMatchObject({ overdue: 1, today: 1 });
      expect(data.taskSummary.due.map((task: { id: string }) => task.id)).toEqual(['overdue', 'later']);
      expect(data.taskSummary.due[0].lead).toEqual({ id: 'task-lead', name: 'Business task-lead' });
    } finally { vi.useRealTimers(); }
  });
  it('uses the same ready audience as leads, excluding suppressed, sourceless and enrolled contacts', async () => {
    await db.lead.createMany({ data: [
      leadRow('ready'), leadRow('unverified', { emailVerified: false }), leadRow('missing-source', { emailSource: null }),
      leadRow('empty-source', { emailSource: '' }), leadRow('suppressed', { email: 'SUPPRESSED@EXAMPLE.COM' }),
      leadRow('opted-out', { optedOutAt: new Date() }), leadRow('replied', { status: 'REPLIED' }),
      leadRow('no-email', { email: null }), leadRow('empty-email', { email: '' }),
    ] });
    await db.suppression.create({ data: { email: 'suppressed@example.com', reason: 'Opted out' } });
    await seedMessages('approved', [{ id: 'enrolled', status: 'QUEUED' }]);
    const response = await dashboard(); expect(response.status).toBe(200);
    const overview = await response.json();
    const ready = await (await leads(new Request('https://workspace.test/api/leads?view=READY'))).json();
    expect(ready.total).toBe(1);
    expect(ready.leads.map((lead: { id: string }) => lead.id)).toEqual(['ready']);
    expect(overview.verified).toBe(ready.total);
    const unverified = await (await leads(new Request('https://workspace.test/api/leads?view=UNVERIFIED'))).json();
    expect(overview.attention.unverified).toBe(unverified.total);
    expect(unverified.total).toBe(5);
  });

  it('keeps accepted counts stable when delivery status changes and excludes uncertain unsent mail', async () => {
    await seedMessages('accepted-campaign', [
      { id: 'accepted', status: 'SENT', sentAt: new Date() },
      { id: 'waiting', status: 'QUEUED' }, { id: 'uncertain', status: 'REVIEW' },
    ]);
    for (const status of ['SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED']) {
      await db.emailMessage.update({ where: { id: 'accepted' }, data: { status } });
      const data = await (await dashboard()).json();
      expect(data.accepted).toBe(1);
      expect(data.emailStates.find((entry: { status: string }) => entry.status === status)?._count).toBe(1);
    }
  });

  it('keeps a four-minute worker run online and identifies an expired heartbeat', async () => {
    await seedMessages('running-campaign', [{ id: 'waiting', status: 'QUEUED' }]);
    await db.workspace.update({ where: { id: 'owner' }, data: { lastWorkerAt: new Date(Date.now() - 4 * 60000), leaseToken: 'test-lease', leaseUntil: new Date(Date.now() + 2 * 60000) } });
    const active = await (await dashboard()).json();
    expect(active.workerOnline).toBe(true);
    expect(active.automation.state).toBe('ready');
    await db.workspace.update({ where: { id: 'owner' }, data: { lastWorkerAt: new Date(Date.now() - 7 * 60000), leaseToken: null, leaseUntil: null } });
    const stale = await (await dashboard()).json();
    expect(stale.workerOnline).toBe(false);
    expect(stale.automation.state).toBe('offline');
    expect(active.settings).not.toHaveProperty('leaseToken');
  });

  it('reports actionable attention counts from the stored workflow states', async () => {
    await seedMessages('active', [
      { id: 'review-1', status: 'REVIEW' }, { id: 'review-2', status: 'REVIEW' },
      { id: 'queued-1', status: 'QUEUED' }, { id: 'queued-2', status: 'QUEUED' }, { id: 'retry', status: 'RETRY' },
    ]);
    await seedMessages('paused', [{ id: 'paused-message', status: 'QUEUED' }], { status: 'PAUSED' });
    await db.campaign.createMany({ data: ['draft-1', 'draft-2'].map(id => ({ id, name: id, subject: 'Draft', body: 'Draft body' })) });
    await db.lead.createMany({ data: [leadRow('reply-1', { status: 'REPLIED' }), leadRow('reply-2', { status: 'REPLIED' }), leadRow('verify-1', { emailVerified: false }), leadRow('verify-2', { emailSource: null })] });
    await db.discoveryJob.createMany({ data: [
      { city: 'KL', category: 'Cafe', status: 'FAILED', enabled: true },
      { city: 'PJ', category: 'Cafe', status: 'FAILED', enabled: false },
      { city: 'Penang', category: 'Cafe', status: 'COMPLETED', enabled: false },
    ] });
    const data = await (await dashboard()).json();
    expect(data.attention).toEqual({ replies: 2, unverified: 2, drafts: 2, reviewMessages: 2, failedSearches: 2, queuedMessages: 3 });
    expect(data.campaigns).toBe(1);
    expect(data.jobs).toBe(1);
  });

  it('keeps message history out of dashboard polling and paginates older review messages', async () => {
    const old = new Date('2026-01-01T00:00:00Z'), recent = new Date('2026-02-01T00:00:00Z');
    await seedMessages('old-campaign', Array.from({ length: 45 }, (_, index) => ({ id: `old-review-${String(index).padStart(3, '0')}`, status: 'REVIEW', createdAt: new Date(old.getTime() + index * 1000), name: index === 0 ? 'Needle business' : undefined, subject: index === 1 ? 'A specific outline' : undefined })), { name: 'Older campaign' });
    await seedMessages('recent-campaign', Array.from({ length: 45 }, (_, index) => ({ id: `recent-${index}`, status: 'SENT', sentAt: recent, createdAt: new Date(recent.getTime() + index * 1000), name: index === 0 ? 'Needle business too' : undefined })));
    const overview = await (await dashboard()).json();
    expect(overview).not.toHaveProperty('recentMessages');
    expect(overview.topLeads[0]).not.toHaveProperty('topReviews');
    expect(overview.attention.reviewMessages).toBe(45);
    const first = await history('?status=REVIEW'), second = await history('?status=REVIEW&page=2');
    expect(first).toMatchObject({ total: 45, page: 1, pages: 2, pageSize: 25 });
    expect(first.messages).toHaveLength(25); expect(second.messages).toHaveLength(20);
    const ids = [...first.messages, ...second.messages].map((message: { id: string }) => message.id);
    expect(new Set(ids).size).toBe(45); expect(ids).toContain('old-review-000');
    expect((await history('?status=REVIEW&page=999')).messages).toEqual(second.messages);
    expect(await history('?status=REVIEW&page=999')).toMatchObject({ page: 2, pages: 2 });
    expect(await history('?status=REVIEW&q=NEEDLE')).toMatchObject({ total: 1, messages: [expect.objectContaining({ id: 'old-review-000' })] });
    expect(await history('?status=REVIEW&q=OLDER%20CAMPAIGN')).toMatchObject({ total: 45 });
    expect(await history('?status=REVIEW&q=specific%20outline')).toMatchObject({ total: 1, messages: [expect.objectContaining({ id: 'old-review-001' })] });
    expect(await history('?status=REVIEW&q=old-review-002%40example.com')).toMatchObject({ total: 1, messages: [expect.objectContaining({ id: 'old-review-002' })] });
    expect(await history('?status=REVIEW&q=absent-business&page=999')).toMatchObject({ total: 0, page: 1, pages: 1, messages: [] });
  });

  it('groups attention and queued delivery states without mixing unrelated statuses', async () => {
    await seedMessages('mixed', ['REVIEW', 'FAILED', 'BOUNCED', 'COMPLAINED', 'QUEUED', 'RETRY', 'SENDING', 'SENT', 'DELIVERED', 'CANCELLED'].map(status => ({ id: status.toLowerCase(), status })));
    const attention = await history('?status=ATTENTION'), queued = await history('?status=QUEUED');
    expect(attention.total).toBe(4); expect(queued.total).toBe(3);
    expect(new Set(attention.messages.map((message: { status: string }) => message.status))).toEqual(new Set(['REVIEW', 'FAILED', 'BOUNCED', 'COMPLAINED']));
    expect(new Set(queued.messages.map((message: { status: string }) => message.status))).toEqual(new Set(['QUEUED', 'RETRY', 'SENDING']));
  });

  it('rejects invalid history filters and non-positive, fractional or unsafe page numbers', async () => {
    for (const query of ['status=UNKNOWN', 'page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=9007199254740992']) {
      const response = await activity(new Request(`https://workspace.test/api/activity?${query}`));
      expect(response.status, query).toBe(400);
      expect(await response.json()).toHaveProperty('error');
    }
  });
});
