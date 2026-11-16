import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { workspace, sendingBlockers, recordActivity } from './workspace';
import { inSendingWindow, malaysiaDayStart, STOP_STATUSES, validEmail } from './domain';
import { enroll, personalized } from './campaigns';
import { sendEmail, SendError } from './email';
import { runDiscovery } from './discovery';
import { checkGmailReplies, emailProvider } from './gmail';

// A database lease serializes workers across web processes. A run never sends after
// losing its lease; provider idempotency covers acceptance followed by a DB failure.
export async function runAutomation(now = new Date()) {
  await workspace();
  const token = randomUUID();
  const claimed = await prisma.workspace.updateMany({ where: { id: 'owner', OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 600000), lastWorkerAt: now } });
  if (!claimed.count) return { busy: true, sent: 0, discovered: 0 };
  const started = Date.now();
  let sent = 0, discovered = 0;
  let warning: string | null = null;
  try {
    await prisma.emailMessage.updateMany({ where: { provider: 'resend', status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - 600000) } }, data: { status: 'RETRY', error: 'Worker interrupted; retrying with the same provider key.' } });
    await prisma.emailMessage.updateMany({ where: { provider: 'gmail', status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - 600000) } }, data: { status: 'REVIEW', error: 'Worker interrupted. Check Gmail Sent before any further action; automatic retries are disabled.' } });
    const settings = await workspace();
    if (settings.sendingEnabled && !sendingBlockers(settings).length && inSendingWindow(settings, now)) {
      const gmail = emailProvider() === 'gmail';
      let checkedReplies = new Set<string>();
      if (gmail) {
        try { checkedReplies = await checkGmailReplies(); }
        catch {
          warning = 'Gmail reply checks could not complete. Email sending is paused for this run; check the Gmail connection. Discovery can continue.';
          if (settings.lastWorkerError !== warning) await recordActivity('ERROR', warning);
        }
      }
      if (!warning) {
        const campaigns = await prisma.campaign.findMany({ where: { status: 'ACTIVE', approvedAt: { not: null }, autoEnroll: true }, take: 20 });
        for (const campaign of campaigns) await enroll(campaign);
        if (settings.followUpsEnabled && (gmail || process.env.INBOUND_REPLY_DOMAIN)) {
          const firstMessages = await prisma.emailMessage.findMany({ where: { step: 0, provider: emailProvider(), ...(gmail ? { enrollmentId: { in: [...checkedReplies] } } : {}), status: { in: gmail ? ['SENT'] : ['DELIVERED'] }, enrollment: { status: 'ACTIVE', campaign: { status: 'ACTIVE', approvedAt: { not: null }, followUpBody: { not: '' } }, messages: { none: { step: 1 } } } }, include: { enrollment: { include: { lead: true, campaign: true } } }, orderBy: [{ sentAt: 'asc' }, { id: 'asc' }], take: 100 });
          for (const first of firstMessages) {
            const { campaign, lead } = first.enrollment;
            if (gmail && !checkedReplies.has(first.enrollmentId)) continue;
            if (!first.sentAt || STOP_STATUSES.includes(lead.status) || lead.optedOutAt || first.sentAt.getTime() + campaign.followUpDays * 86400000 > now.getTime()) continue;
            const copy = personalized(campaign, lead, settings, true);
            const frozen = campaign.approvedSettings ? JSON.parse(campaign.approvedSettings) : settings;
            await prisma.emailMessage.upsert({ where: { enrollmentId_step: { enrollmentId: first.enrollmentId, step: 1 } }, update: {}, create: { provider: first.provider, enrollmentId: first.enrollmentId, step: 1, recipient: first.recipient, sender: first.sender, replyTo: first.replyTo, subject: first.subject, body: `${copy.body}\n\n${frozen.senderName}\n${frozen.businessAddress}`, unsubscribeUrl: first.unsubscribeUrl } });
          }
        }
        // Ineligible follow-ups must not occupy the bounded queue ahead of new introductions.
        const followUpsAllowed = settings.followUpsEnabled && (gmail || !!process.env.INBOUND_REPLY_DOMAIN);
        const steps = [{ step: 0 }, ...(followUpsAllowed ? [{ step: 1, ...(gmail ? { enrollmentId: { in: [...checkedReplies] } } : {}) }] : [])];
        const candidates = await prisma.emailMessage.findMany({ where: { provider: emailProvider(), status: { in: ['QUEUED', 'RETRY'] }, scheduledAt: { lte: now }, OR: steps, enrollment: { status: 'ACTIVE', campaign: { status: 'ACTIVE', approvedAt: { not: null } } } }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: 10 });
        for (const candidate of candidates) {
          if (Date.now() - started > 240000) break;
          const freshSettings = await workspace();
          if (!freshSettings.sendingEnabled || sendingBlockers(freshSettings).length || freshSettings.leaseToken !== token || !freshSettings.leaseUntil || freshSettings.leaseUntil.getTime() < Date.now() + 20000 || !inSendingWindow(freshSettings, new Date())) break;
          if (candidate.step === 1 && (!freshSettings.followUpsEnabled || (gmail ? !checkedReplies.has(candidate.enrollmentId) : !process.env.INBOUND_REPLY_DOMAIN))) continue;
          const current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: candidate.id }, include: { enrollment: { include: { lead: true, campaign: true } } } });
          const { lead, campaign } = current.enrollment;
          if (!['QUEUED', 'RETRY'].includes(current.status) || campaign.status !== 'ACTIVE' || !campaign.approvedAt || current.enrollment.status !== 'ACTIVE') continue;
          if (lead.optedOutAt || !lead.emailVerified || !lead.emailSource?.trim() || !validEmail(current.recipient) || lead.email !== current.recipient || STOP_STATUSES.includes(lead.status) || await prisma.suppression.findFirst({ where: { email: { equals: current.recipient, mode: 'insensitive' } } })) {
            await prisma.emailMessage.update({ where: { id: current.id }, data: { status: 'CANCELLED', error: 'Contact is no longer eligible.' } }); continue;
          }
          if (current.provider === 'resend' && current.firstAttemptAt && current.firstAttemptAt.getTime() < Date.now() - 23 * 3600000) {
            await prisma.emailMessage.update({ where: { id: current.id }, data: { status: 'REVIEW', error: 'Idempotency window expired. Check delivery in Resend; automatic retry stopped.' } }); continue;
          }
          const day = malaysiaDayStart(new Date());
          const used = await prisma.emailMessage.count({ where: { lastAttemptAt: { gte: day } } });
          if ((!current.lastAttemptAt || current.lastAttemptAt < day) && used >= freshSettings.dailyLimit) break;
          const claim = await prisma.emailMessage.updateMany({ where: { id: current.id, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'SENDING', attempts: { increment: 1 }, firstAttemptAt: current.firstAttemptAt ?? new Date(), lastAttemptAt: new Date() } });
          if (!claim.count) continue;
          try {
            const receipt = await sendEmail(current);
            await prisma.$transaction(async tx => {
              // A very fast webhook may already have set DELIVERED or BOUNCED.
              await tx.emailMessage.updateMany({ where: { id: current.id, status: 'SENDING' }, data: { status: 'SENT', providerId: receipt.id, threadId: receipt.threadId, sentAt: new Date(), error: null } });
              await tx.lead.updateMany({ where: { id: lead.id, status: 'NEW' }, data: { status: 'CONTACTED', lastContactedAt: new Date() } });
              await tx.activity.create({ data: { kind: 'EMAIL', message: `Email accepted for ${lead.name}${current.step ? ' (follow-up)' : ''}.`, entityId: current.id } });
            });
            sent++;
          } catch (error) {
            const retry = current.provider === 'resend' && (!(error instanceof SendError) || error.retryable);
            const message = current.provider === 'gmail' ? 'Gmail acknowledgement not confirmed. Check Gmail Sent; no automatic retry will be attempted.' : error instanceof SendError ? error.message : 'Delivery response could not be confirmed.';
            await prisma.emailMessage.updateMany({ where: { id: current.id, status: 'SENDING' }, data: { status: current.provider === 'gmail' ? 'REVIEW' : retry && current.attempts < 2 ? 'RETRY' : retry ? 'REVIEW' : 'FAILED', error: message, scheduledAt: new Date(Date.now() + (current.attempts + 1) * 300000) } });
            await recordActivity('ERROR', `${lead.name}: ${message}`, current.id);
            if (current.provider === 'gmail' || (error instanceof SendError && !error.retryable)) break;
          }
        }
      }
    }
    // Discovery has a 150 second browser budget. Leave room inside the route's
    // 300 second limit after email/reply work, rather than starting it too late.
    if (Date.now() - started < 120000) discovered = await runDiscovery();
    await prisma.workspace.updateMany({ where: { id: 'owner', leaseToken: token }, data: { lastWorkerError: warning } });
    return { busy: false, sent, discovered, ...(warning ? { warning } : {}) };
  } catch (error) {
    await prisma.workspace.updateMany({ where: { id: 'owner', leaseToken: token }, data: { lastWorkerError: 'Worker failed. Check database connectivity and server logs.' } });
    throw error;
  } finally { await prisma.workspace.updateMany({ where: { id: 'owner', leaseToken: token }, data: { leaseToken: null, leaseUntil: null } }); }
}
