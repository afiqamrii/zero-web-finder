import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localPostgres } from './local-postgres.mjs';
import { fromMytDateTime, taskDayBounds, toMytDateTime } from '@/lib/task-dates';

let local: Awaited<ReturnType<typeof localPostgres>>;
let db: typeof import('@/lib/prisma').prisma;
let tasks: typeof import('@/app/api/tasks/route');
let taskDetail: typeof import('@/app/api/tasks/[id]/route');
let pipeline: typeof import('@/app/api/pipeline/route');
const request = (path: string, body?: unknown, method = 'POST') => new Request(`https://workspace.test${path}`, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  local = await localPostgres({ seed: true });
  process.env.DATABASE_URL = local.url; process.env.DIRECT_URL = local.url;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tasks and pipeline must not make external requests'); }));
  ({ prisma: db } = await import('@/lib/prisma'));
  tasks = await import('@/app/api/tasks/route'); taskDetail = await import('@/app/api/tasks/[id]/route'); pipeline = await import('@/app/api/pipeline/route');
  expect((await db.lead.findUniqueOrThrow({ where: { id: 'legacy-test' } })).notes).toBe('Keep this original note');
  const flags = await db.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'SalesTask'`;
  expect(flags[0].relrowsecurity).toBe(true);
  const indexes = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE tablename = 'SalesTask'`;
  expect(indexes.map(row => row.indexname)).toContain('SalesTask_leadId_status_dueAt_idx');
  const lookupIndexes = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE tablename IN ('Lead', 'Suppression', 'Enrollment')`;
  expect(lookupIndexes.map(row => row.indexname)).toEqual(expect.arrayContaining(['Lead_updatedAt_id_idx', 'Lead_email_normalized_idx', 'Suppression_email_normalized_idx', 'Enrollment_email_normalized_idx']));
});

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "SalesTask", "EmailMessage", "Enrollment", "Campaign", "Lead", "Suppression", "DiscoveryJob", "Activity", "WebhookEvent", "Workspace" CASCADE');
  await db.lead.create({ data: { id: 'lead-1', placeId: 'place-1', name: 'Kopi Studio', category: 'Cafe', address: 'Petaling Jaya', mapsUrl: '', status: 'NEW', dealValueCents: 149900, revenueCents: 50000, score: 75 } });
});
afterEach(() => vi.useRealTimers());
afterAll(async () => { vi.unstubAllGlobals(); await db?.$disconnect(); await local?.close(); });

async function createTask(title = 'Prepare a proposal', dueAt = '2026-11-17T09:00:00+08:00') {
  const response = await tasks.POST(request('/api/tasks', { leadId: 'lead-1', title, dueAt }));
  expect(response.status).toBe(201);
  return (await response.json()).task;
}
async function list(query = '') {
  const response = await tasks.GET(request('/api/tasks' + query)); expect(response.status).toBe(200); return response.json();
}

describe('persisted sales tasks and pipeline', () => {
  it('creates a task and activity together without changing the lead or sending mail', async () => {
    const before = await db.lead.findUniqueOrThrow({ where: { id: 'lead-1' } });
    const task = await createTask();
    expect(task).toMatchObject({ title: 'Prepare a proposal', dueAt: '2026-11-17T01:00:00.000Z', status: 'OPEN', completedAt: null, lead: { id: 'lead-1', name: 'Kopi Studio' } });
    expect(await db.lead.findUniqueOrThrow({ where: { id: 'lead-1' } })).toEqual(before);
    expect(await db.activity.count({ where: { kind: 'TASK', entityId: 'lead-1' } })).toBe(1);
    expect(await db.emailMessage.count()).toBe(0);
    expect((await taskDetail.GET(request(`/api/tasks/${task.id}`), context(task.id))).status).toBe(200);
  });

  it('edits, completes, reopens and deletes with version checks and activity history', async () => {
    let task = await createTask();
    const update = async (body: unknown) => taskDetail.PATCH(request(`/api/tasks/${task.id}`, body, 'PATCH'), context(task.id));
    const edited = await update({ title: 'Call about the proposal', dueAt: '2026-11-18T14:30:00+08:00', expectedUpdatedAt: task.updatedAt });
    expect(edited.status).toBe(200); task = (await edited.json()).task;
    expect(task.title).toBe('Call about the proposal'); expect(task.dueAt).toBe('2026-11-18T06:30:00.000Z');
    const completed = await update({ status: 'DONE', expectedUpdatedAt: task.updatedAt });
    expect(completed.status).toBe(200); task = (await completed.json()).task; expect(task.completedAt).not.toBeNull();
    const reopened = await update({ status: 'OPEN', expectedUpdatedAt: task.updatedAt });
    expect(reopened.status).toBe(200); task = (await reopened.json()).task; expect(task.completedAt).toBeNull();
    expect((await taskDetail.DELETE(request(`/api/tasks/${task.id}`, { expectedUpdatedAt: task.updatedAt }, 'DELETE'), context(task.id))).status).toBe(200);
    expect(await db.salesTask.count()).toBe(0); expect(await db.activity.count({ where: { kind: 'TASK' } })).toBe(5);
    expect(await db.lead.count()).toBe(1);
  });

  it('rejects stale changes and deletion without overwriting the newer task', async () => {
    const original = await createTask();
    expect((await taskDetail.PATCH(request('/api/tasks/x', { title: 'A newer note', expectedUpdatedAt: original.updatedAt }, 'PATCH'), context(original.id))).status).toBe(200);
    expect((await taskDetail.PATCH(request('/api/tasks/x', { status: 'DONE', expectedUpdatedAt: original.updatedAt }, 'PATCH'), context(original.id))).status).toBe(409);
    expect((await taskDetail.DELETE(request('/api/tasks/x', { expectedUpdatedAt: original.updatedAt }, 'DELETE'), context(original.id))).status).toBe(409);
    expect(await db.salesTask.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ title: 'A newer note', status: 'OPEN' });
    expect(await db.activity.count()).toBe(2);
  });

  it('accepts one of two simultaneous edits to the same saved version', async () => {
    const task = await createTask();
    const responses = await Promise.all(['First edit', 'Second edit'].map(title => taskDetail.PATCH(request('/api/tasks/x', { title, expectedUpdatedAt: task.updatedAt }, 'PATCH'), context(task.id))));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await db.activity.count()).toBe(2);
  });

  it('validates bounded fields, explicit time zones, calendar dates and permitted mutations', async () => {
    for (const input of [
      { leadId: 'lead-1', title: '', dueAt: '2026-11-17T01:00:00Z' },
      { leadId: 'lead-1', title: 'x'.repeat(161), dueAt: '2026-11-17T01:00:00Z' },
      { leadId: 'lead-1', title: 'Task', dueAt: '2026-11-17T09:00' },
      { leadId: 'lead-1', title: 'Task', dueAt: '2026-02-30T01:00:00Z' },
      { leadId: 'lead-1', title: 'Task', dueAt: '2026-11-17T25:00:00Z' },
      { leadId: 'lead-1', title: 'Task', dueAt: '2026-11-17T01:00:00Z', status: 'DONE' },
    ]) expect((await tasks.POST(request('/api/tasks', input))).status).toBe(400);
    expect((await tasks.POST(request('/api/tasks', { leadId: 'missing', title: 'Task', dueAt: '2026-11-17T01:00:00Z' }))).status).toBe(404);
    expect(await db.salesTask.count()).toBe(0); expect(await db.activity.count()).toBe(0);
    const task = await createTask();
    for (const input of [{ status: 'DONE' }, { expectedUpdatedAt: task.updatedAt, leadId: 'other' }, { expectedUpdatedAt: task.updatedAt, status: 'SENDING' }, { expectedUpdatedAt: task.updatedAt }]) expect((await taskDetail.PATCH(request('/api/tasks/x', input, 'PATCH'), context(task.id))).status).toBe(400);
  });

  it('separates overdue, remaining-today and upcoming using Malaysia midnight and the current instant', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-16T15:30:00Z')); // 11:30 pm MYT
    await db.salesTask.createMany({ data: [
      { id: 'overdue', leadId: 'lead-1', title: 'Overdue', dueAt: new Date('2026-11-16T15:29:59Z') },
      { id: 'now', leadId: 'lead-1', title: 'Due now', dueAt: new Date('2026-11-16T15:30:00Z') },
      { id: 'today', leadId: 'lead-1', title: 'Due before midnight', dueAt: new Date('2026-11-16T15:59:59Z') },
      { id: 'tomorrow', leadId: 'lead-1', title: 'Midnight tomorrow', dueAt: new Date('2026-11-16T16:00:00Z') },
      { id: 'done', leadId: 'lead-1', title: 'Already complete', dueAt: new Date('2026-11-15T01:00:00Z'), status: 'DONE', completedAt: new Date() },
    ] });
    expect((await list('?view=OVERDUE')).tasks.map((task: { id: string }) => task.id)).toEqual(['overdue']);
    expect((await list('?view=TODAY')).tasks.map((task: { id: string }) => task.id)).toEqual(['now', 'today']);
    expect((await list('?view=UPCOMING')).tasks.map((task: { id: string }) => task.id)).toEqual(['tomorrow']);
    expect((await list()).counts).toEqual({ open: 4, overdue: 1, today: 2, upcoming: 1, done: 1, all: 5 });
    expect((await list('?status=DONE')).tasks.map((task: { id: string }) => task.id)).toEqual(['done']);
    expect(taskDayBounds().tomorrow.toISOString()).toBe('2026-11-16T16:00:00.000Z');
    expect(fromMytDateTime('2026-11-17T00:00')).toBe('2026-11-16T16:00:00.000Z');
    expect(toMytDateTime('2026-11-16T16:00:00Z')).toBe('2026-11-17T00:00');
    expect(() => fromMytDateTime('2026-02-30T09:00')).toThrow();
  });

  it('paginates task history, combines search/status/lead filters, and clamps large pages', async () => {
    await db.lead.create({ data: { id: 'lead-2', placeId: 'place-2', name: 'Other business', category: 'Shop', address: 'KL', mapsUrl: '' } });
    await db.salesTask.createMany({ data: Array.from({ length: 29 }, (_, index) => ({ id: `task-${String(index).padStart(2, '0')}`, leadId: index === 28 ? 'lead-2' : 'lead-1', title: index === 27 ? 'Specific project proposal' : `Call ${index}`, dueAt: new Date('2026-11-17T01:00:00Z'), status: index === 26 ? 'DONE' : 'OPEN', completedAt: index === 26 ? new Date() : null })) });
    const first = await list('?view=ALL'), second = await list('?view=ALL&page=2');
    expect(first).toMatchObject({ total: 29, page: 1, pages: 2, pageSize: 25 }); expect(first.tasks).toHaveLength(25); expect(second.tasks).toHaveLength(4);
    expect(await list('?view=ALL&page=999')).toMatchObject({ page: 2, tasks: second.tasks });
    expect(await list('?status=OPEN&leadId=lead-1&q=SPECIFIC')).toMatchObject({ total: 1, tasks: [expect.objectContaining({ id: 'task-27' })] });
    expect(await list('?status=DONE&q=kopi')).toMatchObject({ total: 1, tasks: [expect.objectContaining({ id: 'task-26' })] });
    expect(await list('?view=ALL&q=missing&page=999')).toMatchObject({ page: 1, pages: 1, total: 0, tasks: [] });
    for (const query of ['view=bad', 'status=bad', 'page=0', 'page=1.2', 'page=nope']) expect((await tasks.GET(request('/api/tasks?' + query))).status).toBe(400);
  });

  it('retains bookkeeping tasks for archived leads and prevents deletion of linked lead history', async () => {
    await db.lead.update({ where: { id: 'lead-1' }, data: { status: 'DO_NOT_CONTACT', optedOutAt: new Date() } });
    const task = await createTask('Finish internal project records');
    expect(task.lead.status).toBe('DO_NOT_CONTACT');
    await expect(db.lead.delete({ where: { id: 'lead-1' } })).rejects.toMatchObject({ code: 'P2003' });
    expect((await list()).total).toBe(1); expect(await db.emailMessage.count()).toBe(0);
  });

  it('returns bounded pipeline cards with full counts, value and next-task context', async () => {
    await db.lead.createMany({ data: Array.from({ length: 30 }, (_, index) => ({ id: `board-${String(index).padStart(2, '0')}`, placeId: `board-place-${index}`, name: `Tailor ${index}`, address: 'KL', category: 'Tailor', mapsUrl: '', status: index < 27 ? 'NEW' : index === 27 ? 'WHATSAPP_SENT' : index === 28 ? 'WON' : 'LOST', dealValueCents: 10000, score: 50, isStarred: index === 0 })) });
    await createTask();
    const response = await pipeline.GET(request('/api/pipeline')); expect(response.status).toBe(200); const board = await response.json();
    const stage = board.stages.find((column: { id: string }) => column.id === 'NEW');
    expect(stage).toMatchObject({ total: 28, valueCents: 419900, pageSize: 12 }); expect(stage.leads).toHaveLength(12);
    expect(stage.leads.find((lead: { id: string }) => lead.id === 'lead-1').tasks).toHaveLength(1);
    expect(board.stages.find((column: { id: string }) => column.id === 'CONTACTED').total).toBe(1);
    expect(board.summary).toEqual({ total: 31, open: 29, openValueCents: 429900, won: 1 });
    const second = await (await pipeline.GET(request('/api/pipeline?stage=NEW&page=99'))).json();
    expect(second.stages).toHaveLength(1); expect(second.stages[0]).toMatchObject({ page: 2, pages: 2, pageSize: 25, total: 28 }); expect(second.stages[0].leads).toHaveLength(3);
    const selected = await (await pipeline.GET(request('/api/pipeline?q=TAILOR&starred=true&type=NO_WEBSITE'))).json();
    expect(selected.summary.total).toBe(1);
    for (const query of ['stage=BAD', 'page=-1', 'type=BAD', 'starred=maybe']) expect((await pipeline.GET(request('/api/pipeline?' + query))).status).toBe(400);
  });

  it('moves a pipeline lead using the existing stale-write guard without inventing revenue', async () => {
    const lead = await db.lead.findUniqueOrThrow({ where: { id: 'lead-1' } }), { PATCH } = await import('@/app/api/leads/[id]/route');
    const response = await PATCH(request('/api/leads/lead-1', { status: 'WON', expectedUpdatedAt: lead.updatedAt.toISOString() }, 'PATCH'), context(lead.id));
    expect(response.status).toBe(200); const won = (await response.json()).lead;
    expect(won.status).toBe('WON'); expect(won.revenueCents).toBe(50000); expect(won.dealValueCents).toBe(149900);
    expect((await PATCH(request('/api/leads/lead-1', { status: 'NEW', expectedUpdatedAt: lead.updatedAt.toISOString() }, 'PATCH'), context(lead.id))).status).toBe(409);
  });
});
