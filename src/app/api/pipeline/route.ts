import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { failure, HttpError, str } from '@/lib/http';
import { PIPELINE_STAGES } from '@/lib/pipeline';

const cardSelect = {
  id: true, name: true, category: true, address: true, status: true, isStarred: true, score: true,
  dealValueCents: true, revenueCents: true, updatedAt: true, optedOutAt: true,
  tasks: { where: { status: 'OPEN' }, orderBy: [{ dueAt: 'asc' as const }, { id: 'asc' as const }], take: 1, select: { id: true, title: true, dueAt: true } },
  _count: { select: { tasks: { where: { status: 'OPEN' } } } },
} satisfies Prisma.LeadSelect;

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const q = str(query.get('q') || '', 'search', 100, false), type = query.get('type') || 'ALL', starred = query.get('starred');
    const stageId = query.get('stage'), stage = PIPELINE_STAGES.find(item => item.id === stageId);
    const requested = Number(query.get('page') || 1);
    if (!['ALL', 'NO_WEBSITE', 'OUTDATED_WEBSITE'].includes(type) || (starred !== null && !['true', 'false'].includes(starred)) || (stageId && !stage)) throw new HttpError(400, 'Choose valid pipeline filters.');
    if (!Number.isSafeInteger(requested) || requested < 1) throw new HttpError(400, 'Choose a valid page.');
    const base: Prisma.LeadWhereInput = {
      ...(type !== 'ALL' ? { leadType: type } : {}), ...(starred === 'true' ? { isStarred: true } : {}),
      ...(q ? { OR: ['name', 'category', 'address', 'email'].map(key => ({ [key]: { contains: q, mode: 'insensitive' } })) } : {}),
    };
    const result = await prisma.$transaction(async tx => {
      const grouped = await tx.lead.groupBy({ where: base, by: ['status'], _count: true, _sum: { dealValueCents: true } });
      const columns = await Promise.all((stage ? [stage] : PIPELINE_STAGES).map(async column => {
        const groups = grouped.filter(group => (column.statuses as readonly string[]).includes(group.status));
        const total = groups.reduce((sum, group) => sum + group._count, 0), valueCents = groups.reduce((sum, group) => sum + (group._sum.dealValueCents ?? 0), 0);
        const pageSize = stage ? 25 : 12, pages = Math.max(1, Math.ceil(total / pageSize)), page = stage ? Math.min(requested, pages) : 1;
        const leads = await tx.lead.findMany({ where: { AND: [base, { status: { in: [...column.statuses] } }] }, select: cardSelect, orderBy: [{ isStarred: 'desc' }, { score: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize });
        return { ...column, leads, total, valueCents, page, pages, pageSize };
      }));
      const open = grouped.filter(group => !['WON', 'LOST', 'CLOSED', 'DO_NOT_CONTACT'].includes(group.status));
      return { stages: columns, summary: { total: grouped.reduce((sum, group) => sum + group._count, 0), open: open.reduce((sum, group) => sum + group._count, 0), openValueCents: open.reduce((sum, group) => sum + (group._sum.dealValueCents ?? 0), 0), won: grouped.find(group => group.status === 'WON')?._count ?? 0 }, serverTime: new Date().toISOString() };
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
    return Response.json(result);
  } catch (error) { return failure(error); }
}
