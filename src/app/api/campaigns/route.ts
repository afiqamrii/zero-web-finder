import { prisma } from '@/lib/prisma';
import { failure, HttpError, integer, jsonBody, str } from '@/lib/http';
import { templateValid } from '@/lib/domain';
import { audienceWhere, unavailableEmails } from '@/lib/campaigns';
export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { enrollments: true } } } });
    const excluded = await unavailableEmails();
    const counts = await Promise.all(campaigns.map(c => prisma.lead.count({ where: audienceWhere(c, excluded) })));
    return Response.json({ campaigns: campaigns.map((c, i) => ({ ...c, eligible: counts[i] })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const data = await jsonBody(request);
    const subject = str(data.subject, 'subject', 180), body = str(data.body, 'email body', 5000), followUpBody = str(data.followUpBody ?? '', 'follow-up', 3000, false);
    if (!templateValid(subject + body + followUpBody)) throw new HttpError(400, 'Use only the supported personalization fields.');
    if (/[\r\n]/.test(subject)) throw new HttpError(400, 'Subject must be a single line.');
    const leadType = str(data.leadType ?? 'ALL', 'lead type');
    if (!['ALL', 'NO_WEBSITE', 'OUTDATED_WEBSITE'].includes(leadType)) throw new HttpError(400, 'Invalid lead type.');
    const campaign = await prisma.campaign.create({ data: { name: str(data.name, 'campaign name', 120), city: str(data.city ?? '', 'city', 100, false), category: str(data.category ?? '', 'category', 100, false), subject, body, followUpBody, leadType, minScore: integer(data.minScore ?? 30, 'Minimum score', 0, 100), followUpDays: integer(data.followUpDays ?? 4, 'Follow-up delay', 2, 30), autoEnroll: data.autoEnroll === true } });
    return Response.json({ campaign }, { status: 201 });
  } catch (error) { return failure(error); }
}
