import type { Prisma } from '@prisma/client';
import { HttpError, str } from './http';
import { taskDayBounds } from './task-dates';

export const TASK_VIEWS = ['OPEN', 'OVERDUE', 'TODAY', 'UPCOMING', 'DONE', 'ALL'] as const;
export type TaskView = typeof TASK_VIEWS[number];
export const taskLeadSelect = { id: true, name: true, status: true, optedOutAt: true } satisfies Prisma.LeadSelect;

export function taskDate(value: unknown, name = 'due date') {
  const text = str(value, name, 40);
  const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!parts) throw new HttpError(400, `Use a valid ${name} with an explicit time zone.`);
  const [, y, m, d, h, minute, second] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const date = new Date(text);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59 || !Number.isFinite(date.getTime())) throw new HttpError(400, `Choose a valid ${name}.`);
  return date;
}

export function taskFilters(params: URLSearchParams) {
  const view = params.get('view') || (params.has('status') ? 'ALL' : 'OPEN');
  const status = params.get('status') || 'ALL';
  if (!(TASK_VIEWS as readonly string[]).includes(view) || !['ALL', 'OPEN', 'DONE'].includes(status)) throw new HttpError(400, 'Choose a valid task view and status.');
  const page = Number(params.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, 'Choose a valid page.');
  return { view: view as TaskView, status, page, q: str(params.get('q') || '', 'search', 100, false), leadId: str(params.get('leadId') || '', 'lead', 100, false) };
}

export function taskViewWhere(view: TaskView, now: Date): Prisma.SalesTaskWhereInput {
  const { tomorrow } = taskDayBounds(now);
  if (view === 'OVERDUE') return { status: 'OPEN', dueAt: { lt: now } };
  if (view === 'TODAY') return { status: 'OPEN', dueAt: { gte: now, lt: tomorrow } };
  if (view === 'UPCOMING') return { status: 'OPEN', dueAt: { gte: tomorrow } };
  if (view === 'ALL') return {};
  return { status: view };
}

export function taskBaseWhere(filters: ReturnType<typeof taskFilters>): Prisma.SalesTaskWhereInput {
  return {
    ...(filters.leadId ? { leadId: filters.leadId } : {}),
    ...(filters.q ? { OR: [{ title: { contains: filters.q, mode: 'insensitive' } }, { lead: { name: { contains: filters.q, mode: 'insensitive' } } }] } : {}),
  };
}
