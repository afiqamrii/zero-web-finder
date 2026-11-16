import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localPostgres } from './local-postgres.mjs';
import { parseLeadImport } from '@/lib/lead-import';

let local: Awaited<ReturnType<typeof localPostgres>>;
let db: typeof import('@/lib/prisma').prisma;
let post: typeof import('@/app/api/leads/import/route').POST;
const request = (csv: string, dryRun?: boolean) => new Request('https://workspace.test/api/leads/import', { method: 'POST', body: JSON.stringify({ csv, dryRun }) });
beforeAll(async () => {
  local = await localPostgres();
  process.env.DATABASE_URL = local.url; process.env.DIRECT_URL = local.url;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('CSV import must never send email or access a website'); }));
  ({ prisma: db } = await import('@/lib/prisma'));
  ({ POST: post } = await import('@/app/api/leads/import/route'));
});
beforeEach(async () => { await db.$executeRawUnsafe('TRUNCATE "Lead", "Campaign", "Enrollment", "EmailMessage", "Activity", "Suppression" CASCADE'); });
afterAll(async () => { vi.unstubAllGlobals(); await db?.$disconnect(); await local?.close(); });

describe('CSV import validation', () => {
  it('recognizes normal headings, quoted commas, Unicode and a BOM', () => {
    const parsed = parseLeadImport('\uFEFFBusiness Name,Industry,City,Email Address,Source\n"Kopi, Corner",Café,吉隆坡,HELLO@EXAMPLE.COM,Direct confirmation');
    expect(parsed.rows[0]).toMatchObject({ status: 'ready', values: { name: 'Kopi, Corner', category: 'Café', address: '吉隆坡', email: 'hello@example.com' } });
  });
  it('handles inherited object property names as unused CSV headings', () => {
    const parsed = parseLeadImport('name,constructor,toString\nKopi Corner,ignore,ignore');
    expect(parsed.ignoredHeaders).toEqual(['constructor', 'toString']);
    expect(parsed.rows[0].status).toBe('ready');
    expect(Object.keys(parsed.rows[0].values)).toHaveLength(8);
  });
  it('accepts provenance notes with colon labels as plain text', () => {
    const { rows } = parseLeadImport('name,source\nKopi Corner,Confirmed: phone conversation');
    expect(rows[0]).toMatchObject({ status: 'ready', values: { emailSource: 'Confirmed: phone conversation' } });
  });
  it('reports malformed cells per row while leaving valid rows importable', () => {
    const { rows } = parseLeadImport('name,email,website\nBad,one@example.com;two@example.com,javascript:alert(1)\nGood,good@example.com,https://example.com\n,empty@example.com,');
    expect(rows.map(row => row.status)).toEqual(['invalid', 'ready', 'invalid']);
    expect(rows[0].issues).toHaveLength(2);
  });
  it('rejects too many rows, too many bytes, malformed quotes and ambiguous headers', () => {
    for (const csv of ['name\n' + 'Business\n'.repeat(201), 'name\n' + 'é'.repeat(60000), 'name,email\n"Unclosed,hello@example.com', 'name,business\nA,B']) expect(() => parseLeadImport(csv)).toThrow();
    expect(parseLeadImport('name\n' + Array.from({ length: 200 }, (_, n) => `Business ${n}`).join('\n')).rows).toHaveLength(200);
  });
  it('never lets invalid early rows prevent a later valid email from importing', () => {
    const { rows } = parseLeadImport('name,email\n,hello@example.com\nGood,HELLO@example.com\nDuplicate,hello@example.com');
    expect(rows.map(row => row.status)).toEqual(['invalid', 'ready', 'duplicate']);
  });
});

describe('CSV import persistence', () => {
  it('defaults to a write-free preview and never accepts client verification or stages', async () => {
    const csv = 'name,email,emailVerified,status\nGood,hello@example.com,true,WON';
    const response = await post(request(csv));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dryRun: true, summary: { ready: 1, imported: 0 }, ignoredHeaders: ['emailVerified', 'status'] });
    expect(await db.lead.count()).toBe(0); expect(await db.activity.count()).toBe(0);
    const committed = await post(request(csv, false)); expect(committed.status).toBe(200);
    expect(await db.lead.findFirst()).toMatchObject({ emailVerified: false, status: 'NEW', revenueCents: 0 });
    expect(await db.enrollment.count()).toBe(0); expect(await db.emailMessage.count()).toBe(0);
  });
  it('preserves existing businesses and skips case-insensitive and within-file duplicates', async () => {
    await db.lead.create({ data: { placeId: 'original', name: 'Original', email: ' EXISTING@EXAMPLE.COM ', emailVerified: true, emailSource: 'Original source', notes: 'Keep me', address: '', mapsUrl: '', category: 'Business' } });
    const csv = 'name,email,source\nOverwrite,existing@example.com,Changed source\nFresh,new@example.com,Business card\nAgain,NEW@example.com,Other\nInvalid,broken email,Other';
    const response = await post(request(csv, false)); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary: { total: 4, imported: 1, duplicates: 2, invalid: 1 } });
    expect(await db.lead.findUnique({ where: { placeId: 'original' } })).toMatchObject({ name: 'Original', notes: 'Keep me', emailSource: 'Original source', emailVerified: true });
    expect(await db.lead.findFirst({ where: { name: 'Fresh' } })).toMatchObject({ emailVerified: false, emailSource: 'Business card' });
    expect(await db.activity.count()).toBe(1);
  });
  it('is replay-safe for no-email rows including harmless whitespace and casing changes', async () => {
    const csv = 'name,address,phone\nKopi Corner,Petaling Jaya,+60 123 4567\nNo Contact,Penang,';
    expect((await post(request(csv, false))).status).toBe(200);
    const replay = await post(request('name,address,phone\n kopi  corner ,petaling jaya,+601234567\nNO CONTACT,Penang,', false));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ summary: { imported: 0, duplicates: 2 } });
    expect(await db.lead.count()).toBe(2); expect(await db.activity.count()).toBe(1);
  });
  it('rechecks the database at commit after a preview', async () => {
    const csv = 'name,email\nFresh,hello@example.com';
    expect((await (await post(request(csv, true))).json()).summary.ready).toBe(1);
    await db.lead.create({ data: { placeId: 'manual', name: 'Added while reviewing', email: 'hello@example.com', address: '', mapsUrl: '', category: 'Business' } });
    const result = await (await post(request(csv, false))).json();
    expect(result.summary).toMatchObject({ imported: 0, duplicates: 1 }); expect(await db.lead.count()).toBe(1);
  });
  it('rejects malformed or oversized requests without partial records', async () => {
    const bad = new Request('https://workspace.test/api/leads/import', { method: 'POST', body: '{bad' });
    expect((await post(bad)).status).toBe(400);
    expect((await post(new Request('https://workspace.test/api/leads/import', { method: 'POST', body: 'x'.repeat(250001) }))).status).toBe(413);
    expect((await post(request('name\n' + 'Business\n'.repeat(201), false))).status).toBe(413);
    expect(await db.lead.count()).toBe(0);
  });
});
