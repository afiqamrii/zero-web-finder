import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { failure, HttpError } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const status = query.get('status') || 'ALL';
    if (!['ALL', 'ATTENTION', 'REVIEW', 'QUEUED', 'SENT', 'DELIVERED', 'CANCELLED'].includes(status)) throw new HttpError(400, 'Choose a valid delivery filter.');
    const search = (query.get('q') || '').trim().slice(0, 100);
    const requested = Number(query.get('page') || 1);
    if (!Number.isSafeInteger(requested) || requested < 1) throw new HttpError(400, 'Choose a valid page.');
    const where: Prisma.EmailMessageWhereInput = {
      ...(status === 'ALL' ? {} : { status: status === 'ATTENTION' ? { in: ['REVIEW', 'FAILED', 'BOUNCED', 'COMPLAINED'] } : status === 'QUEUED' ? { in: ['QUEUED', 'RETRY', 'SENDING'] } : status }),
      ...(search ? { OR: [
        { recipient: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { enrollment: { lead: { name: { contains: search, mode: 'insensitive' } } } },
        { enrollment: { campaign: { name: { contains: search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const result = await prisma.$transaction(async tx => {
      const total = await tx.emailMessage.count({ where });
      const pageSize = 25, pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(requested, pages);
      const messages = await tx.emailMessage.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: {
        id: true, subject: true, recipient: true, status: true, provider: true, error: true, sentAt: true, scheduledAt: true, step: true,
        enrollment: { select: { lead: { select: { id: true, name: true } }, campaign: { select: { name: true } } } },
      } });
      return { messages, total, page, pages, pageSize };
    }, { isolationLevel: 'RepeatableRead' });
    return Response.json(result);
  } catch (error) { return failure(error); }
}
