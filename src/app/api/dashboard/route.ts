import { prisma } from '@/lib/prisma';
import { failure } from '@/lib/http';
import { workspace, connectionStatus, sendingBlockers } from '@/lib/workspace';
import { malaysiaDayStart } from '@/lib/domain';
import { emailProvider } from '@/lib/gmail';
import { automationSummary } from '@/lib/dashboard';
import { leadWhere, parseLeadFilters } from '@/lib/lead-filters';
export async function GET() {
  try {
    const now = new Date();
    const tomorrow = new Date(malaysiaDayStart(now).getTime() + 86400000);
    const [readyWhere, unverifiedWhere] = await Promise.all([
      leadWhere(parseLeadFilters(new URLSearchParams({ view: 'READY' }))),
      leadWhere(parseLeadFilters(new URLSearchParams({ view: 'UNVERIFIED' }))),
    ]);
    const [settings, stages, money, emailStates, today, activity, topLeads, campaigns, jobs, verified, unverified, drafts, reviewMessages, failedSearches, queuedMessages, accepted, overdueTasks, todayTasks, dueTasks] = await Promise.all([
      workspace(), prisma.lead.groupBy({ by: ['status'], _count: true, _sum: { dealValueCents: true } }),
      prisma.lead.aggregate({ _sum: { revenueCents: true } }), prisma.emailMessage.groupBy({ by: ['status'], _count: true }),
      prisma.emailMessage.count({ where: { lastAttemptAt: { gte: malaysiaDayStart(now) } } }),
      prisma.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
      prisma.lead.findMany({ where: { status: { in: ['NEW', 'REPLIED', 'CALL_SCHEDULED', 'PROPOSAL_SENT'] }, optedOutAt: null }, select: { id: true, name: true, category: true, address: true, score: true }, orderBy: [{ isStarred: 'desc' }, { score: 'desc' }, { id: 'asc' }], take: 5 }),
      prisma.campaign.count({ where: { status: 'ACTIVE' } }), prisma.discoveryJob.count({ where: { enabled: true } }),
      prisma.lead.count({ where: readyWhere }),
      prisma.lead.count({ where: unverifiedWhere }),
      prisma.campaign.count({ where: { status: 'DRAFT' } }),
      prisma.emailMessage.count({ where: { status: 'REVIEW' } }),
      prisma.discoveryJob.count({ where: { status: 'FAILED' } }),
      prisma.emailMessage.count({ where: { status: { in: ['QUEUED', 'RETRY'] }, enrollment: { status: 'ACTIVE', campaign: { status: 'ACTIVE' } } } }),
      prisma.emailMessage.count({ where: { sentAt: { not: null } } }),
      prisma.salesTask.count({ where: { status: 'OPEN', dueAt: { lt: now } } }),
      prisma.salesTask.count({ where: { status: 'OPEN', dueAt: { gte: now, lt: tomorrow } } }),
      prisma.salesTask.findMany({ where: { status: 'OPEN', dueAt: { lt: tomorrow } }, select: { id: true, title: true, dueAt: true, lead: { select: { id: true, name: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 5 }),
    ]);
    const workerOnline = !!settings.lastWorkerAt && now.getTime() - settings.lastWorkerAt.getTime() < 360000;
    const blockers = sendingBlockers(settings);
    return Response.json({
      preview: process.env.LOCAL_TEST_WORKSPACE === 'true', serverTime: now.toISOString(), provider: emailProvider(), workerOnline,
      settings: { dailyLimit: settings.dailyLimit, sendingEnabled: settings.sendingEnabled, lastWorkerAt: settings.lastWorkerAt, lastWorkerError: settings.lastWorkerError, sendStartHour: settings.sendStartHour, sendEndHour: settings.sendEndHour, weekdaysOnly: settings.weekdaysOnly },
      connections: connectionStatus(settings), blockers, stages, revenue: money._sum.revenueCents ?? 0, emailStates, today, activity, topLeads, campaigns, jobs, verified, accepted,
      attention: { replies: stages.find(stage => stage.status === 'REPLIED')?._count ?? 0, unverified, drafts, reviewMessages, failedSearches, queuedMessages },
      taskSummary: { overdue: overdueTasks, today: todayTasks, due: dueTasks },
      automation: automationSummary({ settings, workerOnline, blockers, today, campaigns, now }),
    });
  } catch (error) { return failure(error); }
}
