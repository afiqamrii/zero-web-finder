import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import type { InsightsResponse } from '@/lib/opportunity';
import { localPostgres } from './local-postgres.mjs';
let local: Awaited<ReturnType<typeof localPostgres>>;
let db: typeof import('@/lib/prisma').prisma;
let insights: typeof import('@/app/api/insights/route').GET;
beforeAll(async () => {
  local = await localPostgres();
  Object.assign(process.env, { DATABASE_URL: local.url, DIRECT_URL: local.url, OWNER_PASSWORD: 'test-owner-password', AUTH_SECRET: 'test-session-secret-'.repeat(3) });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Insight analysis must not make external requests'); }));
  ({ prisma: db } = await import('@/lib/prisma'));
  ({ GET: insights } = await import('@/app/api/insights/route'));
});
beforeEach(async () => { await db.$executeRawUnsafe('TRUNCATE "Lead", "Suppression", "Campaign", "Workspace" CASCADE'); });
afterAll(async () => { vi.unstubAllGlobals(); await db?.$disconnect(); await local?.close(); });
function row(id: string, extra: Partial<Prisma.LeadCreateManyInput> = {}): Prisma.LeadCreateManyInput {
  return { id, placeId: id, name: `Business ${id}`, category: 'Cafe', address: 'Petaling Jaya', mapsUrl: 'https://maps.google.com/?q=test', email: `${id}@example.com`, emailVerified: true, emailSource: 'Business contact page', rating: 4.7, reviewCount: 100, ...extra };
}
async function analyze() { const response = await insights(); expect(response.status).toBe(200); return await response.json() as InsightsResponse; }
describe('Opportunity Studio API', () => {
  it('is protected by the owner-session boundary', async () => {
    const { proxy } = await import('@/proxy');
    expect(proxy(new NextRequest('https://workspace.test/api/insights')).status).toBe(401);
    const { createSession } = await import('@/lib/auth');
    expect(proxy(new NextRequest('https://workspace.test/api/insights', { headers: { Cookie: `zwf_owner=${createSession()}` } })).status).toBe(200);
  });
  it('ranks saved open leads and excludes opt-outs, closed stages, and legacy suppressed mailboxes', async () => {
    await db.lead.createMany({ data: [row('ready'), row('reply', { status: 'REPLIED' }), row('unverified', { emailVerified: false }), row('won', { status: 'WON' }), row('optout', { optedOutAt: new Date() }), row('suppressed', { email: '  BLOCKED@EXAMPLE.COM  ' })] });
    await db.suppression.create({ data: { email: ' blocked@example.com ', reason: 'Opted out' } });
    const result = await analyze();
    expect(result.opportunities.map(item => item.lead.id)).toEqual(['reply', 'ready', 'unverified']);
    expect(result.coverage).toMatchObject({ totalOpen: 4, scanned: 4, ranked: 3, excluded: 1 });
    expect(result.summary).toMatchObject({ ready: 1, research: 1, conversations: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('checks campaign history and duplicate mailboxes across records outside the result sample', async () => {
    await db.lead.createMany({ data: [row('past', { status: 'LOST', email: 'used@example.com' }), row('new', { email: ' USED@EXAMPLE.COM ' }), row('shared-one', { email: 'shared@example.com' }), row('shared-two', { email: 'SHARED@EXAMPLE.COM' })] });
    const campaign = await db.campaign.create({ data: { name: 'Old campaign', subject: 'Hello', body: 'Hello' } });
    await db.enrollment.create({ data: { campaignId: campaign.id, leadId: 'past', email: ' used@example.com ' } });
    const result = await analyze();
    expect(result.opportunities.find(item => item.lead.id === 'new')?.analysis.nextAction.id).toBe('review-history');
    expect(result.opportunities.filter(item => item.lead.id.startsWith('shared')).every(item => item.analysis.nextAction.id === 'resolve-duplicate')).toBe(true);
    expect(result.summary.ready).toBe(0);
  });
  it('discloses bounded scanning and output rather than pretending the sample is the entire database', async () => {
    await db.lead.createMany({ data: Array.from({ length: 505 }, (_, index) => row(`lead-${String(index).padStart(3, '0')}`, { updatedAt: new Date(1700000000000 + index * 1000) })) });
    const result = await analyze();
    expect(result.coverage).toMatchObject({ totalOpen: 505, scanned: 500, ranked: 500, returned: 100, scanLimit: 500, resultLimit: 100, scanCapped: true, resultCapped: true });
    expect(result.opportunities).toHaveLength(100); expect(result.opportunities.some(item => item.lead.id === 'lead-000')).toBe(false);
    expect(result.summary.ready).toBe(500); expect(result.summary.categories).toEqual([{ name: 'Cafe', count: 500 }]);
  });
  it('handles an empty workspace without creating settings or calling a provider', async () => {
    const result = await analyze();
    expect(result.coverage.scanned).toBe(0); expect(result.opportunities).toEqual([]); expect(result.summary.averageScore).toBe(0);
    expect(await db.workspace.count()).toBe(0); expect(fetch).not.toHaveBeenCalled();
  });
});
