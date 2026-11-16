import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { failure, HttpError, jsonBody, str } from '@/lib/http';
import { taskDate, taskLeadSelect } from '@/lib/sales-tasks';

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const { id } = await params; return Response.json({ task: await prisma.salesTask.findUniqueOrThrow({ where: { id }, include: { lead: { select: taskLeadSelect } } }) }); }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params, input = await jsonBody(request);
    if (Object.keys(input).some(key => !['title', 'dueAt', 'status', 'expectedUpdatedAt'].includes(key))) throw new HttpError(400, 'Unsupported task field.');
    const expected = taskDate(input.expectedUpdatedAt, 'last saved version');
    const data: Prisma.SalesTaskUpdateManyMutationInput = {};
    if ('title' in input) data.title = str(input.title, 'task title', 160).replace(/\s+/g, ' ');
    if ('dueAt' in input) data.dueAt = taskDate(input.dueAt);
    if ('status' in input) { const status = str(input.status, 'task status'); if (!['OPEN', 'DONE'].includes(status)) throw new HttpError(400, 'Choose Open or Done.'); data.status = status; }
    if (!Object.keys(data).length) throw new HttpError(400, 'Choose a task change to save.');
    const task = await prisma.$transaction(async tx => {
      const current = await tx.salesTask.findUniqueOrThrow({ where: { id }, include: { lead: { select: taskLeadSelect } } });
      if (current.updatedAt.getTime() !== expected.getTime()) throw new HttpError(409, 'This task changed in another view. Refresh and review the latest details.');
      if (data.status === 'DONE') data.completedAt = current.completedAt ?? new Date();
      if (data.status === 'OPEN') data.completedAt = null;
      data.updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const changed = await tx.salesTask.updateMany({ where: { id, updatedAt: expected }, data });
      if (!changed.count) throw new HttpError(409, 'This task changed in another view. Refresh and review the latest details.');
      const updated = await tx.salesTask.findUniqueOrThrow({ where: { id }, include: { lead: { select: taskLeadSelect } } });
      const action = updated.status !== current.status ? updated.status === 'DONE' ? 'completed' : 'reopened' : 'updated';
      await tx.activity.create({ data: { kind: 'TASK', message: `Task ${action} for ${current.lead.name}: ${updated.title}.`, entityId: current.leadId } });
      return updated;
    });
    return Response.json({ task });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params, input = await jsonBody(request);
    if (Object.keys(input).some(key => key !== 'expectedUpdatedAt')) throw new HttpError(400, 'Unsupported task field.');
    const expected = taskDate(input.expectedUpdatedAt, 'last saved version');
    await prisma.$transaction(async tx => {
      const task = await tx.salesTask.findUniqueOrThrow({ where: { id }, include: { lead: { select: taskLeadSelect } } });
      const removed = await tx.salesTask.deleteMany({ where: { id, updatedAt: expected } });
      if (!removed.count) throw new HttpError(409, 'This task changed in another view. Refresh before deleting it.');
      await tx.activity.create({ data: { kind: 'TASK', message: `Task removed for ${task.lead.name}: ${task.title}.`, entityId: task.leadId } });
    });
    return Response.json({ success: true });
  } catch (error) { return failure(error); }
}
