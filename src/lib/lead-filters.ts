import type { Prisma } from '@prisma/client';
import { STATUSES } from './domain';
import { HttpError } from './http';
import { audienceWhere, unavailableEmails } from './campaigns';

export const LEAD_VIEWS = ['ALL', 'READY', 'UNVERIFIED', 'STARRED', 'OPEN'] as const;
export const LEAD_SORTS = ['priority', 'newest', 'oldest', 'value', 'name'] as const;
export type LeadView = typeof LEAD_VIEWS[number];
export type LeadSort = typeof LEAD_SORTS[number];
export function parseLeadFilters(params: URLSearchParams) {
  const status = params.get('status') || 'ALL';
  const type = params.get('type') || 'ALL';
  const view = params.get('view') || (params.get('starred') === 'true' ? 'STARRED' : 'ALL');
  const sort = params.get('sort') || 'priority';
  if (status !== 'ALL' && !(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, 'Choose a valid lead stage.');
  if (!['ALL', 'NO_WEBSITE', 'OUTDATED_WEBSITE'].includes(type)) throw new HttpError(400, 'Choose a valid opportunity.');
  if (!(LEAD_VIEWS as readonly string[]).includes(view) || !(LEAD_SORTS as readonly string[]).includes(sort)) throw new HttpError(400, 'Choose a valid lead view and sort order.');
  const requestedPage = Number(params.get('page'));
  return { q: (params.get('q') || '').slice(0, 100).trim(), status, type, view: view as LeadView, sort: sort as LeadSort, page: Number.isFinite(requestedPage) ? Math.max(1, Math.min(100000, Math.floor(requestedPage))) : 1 };
}
export async function leadWhere(filters: ReturnType<typeof parseLeadFilters>): Promise<Prisma.LeadWhereInput> {
  const and: Prisma.LeadWhereInput[] = [];
  if (filters.status !== 'ALL') and.push({ status: filters.status });
  if (filters.type !== 'ALL') and.push({ leadType: filters.type });
  if (filters.q) and.push({ OR: ['name', 'category', 'address', 'email', 'phone'].map(key => ({ [key]: { contains: filters.q, mode: 'insensitive' } })) });
  if (filters.view === 'STARRED') and.push({ isStarred: true });
  if (filters.view === 'OPEN') and.push({ status: { notIn: ['WON', 'CLOSED', 'LOST', 'DO_NOT_CONTACT'] }, optedOutAt: null });
  if (filters.view === 'UNVERIFIED') and.push({ optedOutAt: null, status: 'NEW', OR: [{ email: null }, { email: '' }, { emailVerified: false }, { emailSource: null }, { emailSource: '' }] });
  if (filters.view === 'READY') and.push(audienceWhere({ city: '', category: '', leadType: 'ALL', minScore: 0 }, await unavailableEmails()), { email: { not: '' }, emailSource: { not: '' } });
  return and.length ? { AND: and } : {};
}
export function leadOrder(sort: LeadSort): Prisma.LeadOrderByWithRelationInput[] {
  if (sort === 'newest') return [{ createdAt: 'desc' }, { id: 'asc' }];
  if (sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (sort === 'value') return [{ dealValueCents: 'desc' }, { score: 'desc' }, { id: 'asc' }];
  if (sort === 'name') return [{ name: 'asc' }, { id: 'asc' }];
  return [{ isStarred: 'desc' }, { score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }];
}
