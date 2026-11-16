import { prisma } from './prisma';
import { normalizeEmail, renderTemplate, validEmail } from './domain';
import { workspace } from './workspace';
import { emailProvider } from './gmail';
import type { Campaign, Lead, Prisma, Workspace } from '@prisma/client';
export function audienceWhere(campaign: Pick<Campaign, 'city' | 'category' | 'leadType' | 'minScore'>, excluded: string[] = []): Prisma.LeadWhereInput {
  return { status: 'NEW', optedOutAt: null, emailVerified: true, emailSource: { not: null, notIn: [''] }, email: { not: null, mode: 'insensitive', ...(excluded.length ? { notIn: excluded } : {}) }, score: { gte: campaign.minScore }, enrollment: null, ...(campaign.city ? { address: { contains: campaign.city, mode: 'insensitive' } } : {}), ...(campaign.category ? { category: { contains: campaign.category, mode: 'insensitive' } } : {}), ...(campaign.leadType !== 'ALL' ? { leadType: campaign.leadType } : {}) };
}
export async function unavailableEmails() { const [suppressed, enrolled] = await Promise.all([prisma.suppression.findMany({ select: { email: true } }), prisma.enrollment.findMany({ select: { email: true } })]); return [...new Set([...suppressed, ...enrolled].map(r => normalizeEmail(r.email)))]; }
export function personalized(campaign: Campaign, lead: Lead, settings: Workspace, followUp = false) {
  if (campaign.approvedSettings) settings = { ...settings, ...JSON.parse(campaign.approvedSettings) };
  const values = { business: lead.name, category: lead.category, city: lead.address, sender: settings.senderName, offer: settings.offer };
  return { subject: renderTemplate(campaign.subject, values), body: renderTemplate(followUp ? campaign.followUpBody : campaign.body, values) };
}
export async function enroll(campaign: Campaign) {
  let settings = await workspace();
  if (campaign.approvedSettings) settings = { ...settings, ...JSON.parse(campaign.approvedSettings) };
  const candidates = await prisma.lead.findMany({ where: audienceWhere(campaign, await unavailableEmails()), orderBy: [{ score: 'desc' }, { id: 'asc' }], take: 200 });
  let count = 0;
  for (const lead of candidates) {
    const email = normalizeEmail(lead.email ?? '');
    if (!validEmail(email) || !lead.emailSource?.trim()) continue;
    try {
      const created = await prisma.$transaction(async tx => {
        const active = await tx.campaign.findUnique({ where: { id: campaign.id } });
        if (active?.status !== 'ACTIVE' || !active.approvedAt) return false;
        const fresh = await tx.lead.findFirst({ where: { ...audienceWhere(campaign), id: lead.id } });
        if (!fresh || fresh.email !== lead.email || !fresh.emailSource?.trim()) return false;
        if (await tx.suppression.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }) || await tx.enrollment.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) return false;
        if (fresh.email !== email) await tx.lead.update({ where: { id: lead.id }, data: { email } });
        const enrollment = await tx.enrollment.create({ data: { campaignId: campaign.id, leadId: lead.id, email } });
        const copy = personalized(campaign, lead, settings);
        const root = (process.env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
        const provider = emailProvider();
        const replyTo = provider === 'resend' && process.env.INBOUND_REPLY_DOMAIN ? `reply+${enrollment.token}@${process.env.INBOUND_REPLY_DOMAIN}` : provider === 'gmail' ? settings.senderEmail : settings.replyTo;
        await tx.emailMessage.create({ data: { provider, enrollmentId: enrollment.id, recipient: email, sender: `${settings.senderName} <${settings.senderEmail}>`, replyTo, ...copy, body: `${copy.body}\n\n${settings.senderName}\n${settings.businessAddress}`, unsubscribeUrl: `${root}/unsubscribe?token=${enrollment.token}` } });
        return true;
      });
      if (created) count++;
    } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error; }
  }
  return count;
}
