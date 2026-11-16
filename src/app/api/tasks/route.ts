import { prisma } from '@/lib/prisma';
import { failure, HttpError, jsonBody, str } from '@/lib/http';
import { taskBaseWhere, taskDate, taskFilters, taskLeadSelect, taskViewWhere } from '@/lib/sales-tasks';

export async function GET(request: Request) {
  try {
    const filters = taskFilters(new URL(request.url).searchParams), now = new Date();
    const base = taskBaseWhere(filters);
    const where = { AND: [base, taskViewWhere(filters.view, now), ...(filters.status === 'ALL' ? [] : [{ status: filters.status }])] };
    const result = await prisma.$transaction(async tx => {
      const [total, open, overdue, today, upcoming, done] = await Promise.all([
        tx.salesTask.count({ where }),
        ...(['OPEN', 'OVERDUE', 'TODAY', 'UPCOMING', 'DONE'] as const).map(view => tx.salesTask.count({ where: { AND: [base, taskViewWhere(view, now)] } })),
      ]);
      const pageSize = 25, pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(filters.page, pages);
      const tasks = await tx.salesTask.findMany({ where, include: { lead: { select: taskLeadSelect } }, skip: (page - 1) * pageSize, take: pageSize, orderBy: filters.view === 'DONE' || filters.status === 'DONE' ? [{ completedAt: 'desc' }, { id: 'asc' }] : [{ dueAt: 'asc' }, { id: 'asc' }] });
      return { tasks, total, page, pages, pageSize, counts: { open, overdue, today, upcoming, done, all: open + done }, serverTime: now.toISOString() };
    }, { isolationLevel: 'RepeatableRead' });
    return Response.json(result);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const input = await jsonBody(request);
    if (Object.keys(input).some(key => !['leadId', 'title', 'dueAt'].includes(key))) throw new HttpError(400, 'Unsupported task field.');
    const leadId = str(input.leadId, 'lead', 100), title = str(input.title, 'task title', 160).replace(/\s+/g, ' '), dueAt = taskDate(input.dueAt);
    const task = await prisma.$transaction(async tx => {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: taskLeadSelect });
      const created = await tx.salesTask.create({ data: { leadId, title, dueAt }, include: { lead: { select: taskLeadSelect } } });
      await tx.activity.create({ data: { kind: 'TASK', message: `Task added for ${lead.name}: ${title}.`, entityId: leadId } });
      return created;
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) { return failure(error); }
}
