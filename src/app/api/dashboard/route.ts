import { prisma } from '@/lib/prisma';
import { failure } from '@/lib/http';
import { workspace, connectionStatus, sendingBlockers } from '@/lib/workspace';
import { malaysiaDayStart } from '@/lib/domain';
export async function GET() {
  try {
    const [settings, stages, money, emailStates, today, activity, topLeads, campaigns, jobs, recentMessages, verified] = await Promise.all([
      workspace(), prisma.lead.groupBy({ by: ['status'], _count: true, _sum: { dealValueCents: true } }),
      prisma.lead.aggregate({ _sum: { revenueCents: true } }), prisma.emailMessage.groupBy({ by: ['status'], _count: true }),
      prisma.emailMessage.count({ where: { lastAttemptAt: { gte: malaysiaDayStart(new Date()) } } }),
      prisma.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
      prisma.lead.findMany({ where: { status: { in: ['NEW', 'REPLIED', 'CALL_SCHEDULED', 'PROPOSAL_SENT'] }, optedOutAt: null }, orderBy: [{ isStarred: 'desc' }, { score: 'desc' }], take: 5 }),
      prisma.campaign.count({ where: { status: 'ACTIVE' } }), prisma.discoveryJob.count({ where: { enabled: true } }),
      prisma.emailMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, subject: true, recipient: true, status: true, error: true, sentAt: true, scheduledAt: true, step: true, enrollment: { select: { lead: { select: { name: true } }, campaign: { select: { name: true } } } } } }),
      prisma.lead.count({ where: { emailVerified: true, status: 'NEW', optedOutAt: null, enrollment: null } }),
    ]);
    return Response.json({ preview: process.env.LOCAL_TEST_WORKSPACE === 'true', workerOnline: !!settings.lastWorkerAt && Date.now() - settings.lastWorkerAt.getTime() < 180000, settings: { dailyLimit: settings.dailyLimit, sendingEnabled: settings.sendingEnabled, lastWorkerAt: settings.lastWorkerAt, lastWorkerError: settings.lastWorkerError, sendStartHour: settings.sendStartHour, sendEndHour: settings.sendEndHour, weekdaysOnly: settings.weekdaysOnly }, connections: connectionStatus(settings), blockers: sendingBlockers(settings), stages, revenue: money._sum.revenueCents ?? 0, emailStates, today, activity, topLeads, campaigns, jobs, recentMessages, verified });
  } catch (error) { return failure(error); }
}
