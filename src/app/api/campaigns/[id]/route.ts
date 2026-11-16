import { prisma } from '@/lib/prisma';
import { failure, HttpError, jsonBody } from '@/lib/http';
import { audienceWhere, enroll, personalized, unavailableEmails } from '@/lib/campaigns';
import { recordActivity, sendingBlockers, workspace } from '@/lib/workspace';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    const settings = await workspace();
    const approved = campaign.approvedSettings ? { ...settings, ...JSON.parse(campaign.approvedSettings) } : settings;
    const where = audienceWhere(campaign, await unavailableEmails());
    const potentialTotal = await prisma.lead.count({ where });
    if (campaign.approvedAt) {
      const [enrolled, total] = await Promise.all([
        prisma.enrollment.findMany({ where: { campaignId: id }, take: 5, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { lead: { select: { name: true } }, messages: { where: { step: 0 }, take: 1 } } }),
        prisma.enrollment.count({ where: { campaignId: id } }),
      ]);
      return Response.json({ campaign, audience: 'enrolled', total, potentialTotal, blockers: sendingBlockers(settings), previews: enrolled.flatMap(enrollment => enrollment.messages.map(message => ({ name: enrollment.lead.name, email: message.recipient, subject: message.subject, body: message.body, status: message.status, unsubscribeUrl: message.unsubscribeUrl, includesSignature: true }))), sender: `${approved.senderName} <${approved.senderEmail}>`, address: approved.businessAddress });
    }
    const leads = await prisma.lead.findMany({ where, take: 5, orderBy: [{ score: 'desc' }, { id: 'asc' }] });
    return Response.json({ campaign, audience: 'potential', total: potentialTotal, potentialTotal, blockers: sendingBlockers(settings), previews: leads.map(lead => ({ name: lead.name, email: lead.email, ...personalized(campaign, lead, settings), includesSignature: false })), sender: `${approved.senderName} <${approved.senderEmail}>`, address: approved.businessAddress });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { action } = await jsonBody(request);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    if (action === 'approve' || action === 'resume') {
      if (action === 'approve' && campaign.status !== 'DRAFT') throw new HttpError(409, 'This campaign is already approved.');
      if (action === 'resume' && (campaign.status !== 'PAUSED' || !campaign.approvedAt)) throw new HttpError(409, 'Only approved, paused campaigns can resume.');
      const settings = await workspace();
      const blockers = sendingBlockers(settings);
      if (blockers.length) throw new HttpError(409, blockers.join(' · '));
      if (action === 'approve' && !campaign.autoEnroll && await prisma.lead.count({ where: audienceWhere(campaign, await unavailableEmails()) }) > 200) throw new HttpError(409, 'One-time campaigns support up to 200 contacts. Narrow the audience or use ongoing enrollment.');
      const approvedSettings = campaign.approvedSettings ?? JSON.stringify({ senderName: settings.senderName, senderEmail: settings.senderEmail, replyTo: settings.replyTo, offer: settings.offer, businessAddress: settings.businessAddress });
      const transition = await prisma.campaign.updateMany({ where: { id, status: campaign.status, updatedAt: campaign.updatedAt }, data: { status: 'ACTIVE', approvedAt: campaign.approvedAt ?? new Date(), approvedSettings } });
      if (!transition.count) throw new HttpError(409, 'This campaign changed in another request. Refresh and review its current status.');
      const updated = await prisma.campaign.findUniqueOrThrow({ where: { id } });
      const queued = action === 'approve' || updated.autoEnroll ? await enroll(updated) : 0;
      await recordActivity('CAMPAIGN', `${campaign.name}: ${action === 'approve' ? 'approved' : 'resumed'}, ${queued} emails queued.`, id);
      return Response.json({ campaign: updated, queued });
    }
    if (action === 'pause') {
      if (campaign.status !== 'ACTIVE') throw new HttpError(409, 'Only active campaigns can pause.');
      const transition = await prisma.campaign.updateMany({ where: { id, status: 'ACTIVE', updatedAt: campaign.updatedAt }, data: { status: 'PAUSED' } });
      if (!transition.count) throw new HttpError(409, 'This campaign changed in another request. Refresh and review its current status.');
      await recordActivity('CAMPAIGN', `${campaign.name}: paused.`, id);
      return Response.json({ success: true });
    }
    throw new HttpError(400, 'Unknown campaign action.');
  } catch (error) { return failure(error); }
}
