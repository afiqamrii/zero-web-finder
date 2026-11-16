import { prisma } from '@/lib/prisma';
import { connectionStatus, sendingBlockers, workspace } from '@/lib/workspace';
import { failure, HttpError, integer, jsonBody, str, boolean } from '@/lib/http';
import { normalizeEmail, validEmail } from '@/lib/domain';
import { emailProvider, gmailConfigured, checkGmailIdentity } from '@/lib/gmail';
export async function GET() {
  try { const settings = await workspace(); return Response.json({ preview: process.env.LOCAL_TEST_WORKSPACE === 'true', provider: emailProvider(), settings: { ...settings, leaseToken: undefined }, connections: connectionStatus(settings), blockers: sendingBlockers(settings) }); } catch (e) { return failure(e); }
}
export async function PATCH(request: Request) {
  try {
    const d = await jsonBody(request), current = await workspace();
    const senderName = str(d.senderName, 'sender name', 100);
    if (/[<>\r\n]/.test(senderName)) throw new HttpError(400, 'Sender name must not contain brackets or line breaks.');
    const senderEmail = normalizeEmail(str(d.senderEmail ?? '', 'sender email', 254, false)), replyTo = normalizeEmail(str(d.replyTo ?? '', 'reply-to email', 254, false));
    if ((senderEmail && !validEmail(senderEmail)) || (replyTo && !validEmail(replyTo))) throw new HttpError(400, 'Enter valid sender and reply-to addresses.');
    const data = { senderName, senderEmail, replyTo, businessAddress: str(d.businessAddress ?? '', 'business address', 500, false), offer: str(d.offer, 'offer', 300), dailyLimit: integer(d.dailyLimit, 'Daily limit', 1, 100), sendStartHour: integer(d.sendStartHour, 'Start hour', 0, 23), sendEndHour: integer(d.sendEndHour, 'End hour', 1, 24), weekdaysOnly: boolean(d.weekdaysOnly, 'weekdays'), sendingEnabled: boolean(d.sendingEnabled, 'sending'), followUpsEnabled: boolean(d.followUpsEnabled, 'follow-ups') };
    if (data.sendEndHour <= data.sendStartHour) throw new HttpError(400, 'End hour must be later than start hour.');
    if (data.sendingEnabled && sendingBlockers({ ...current, ...data }).length) throw new HttpError(409, 'Complete the connection checklist before enabling sending.');
    if (data.followUpsEnabled && !(emailProvider() === 'gmail' ? gmailConfigured() : process.env.INBOUND_REPLY_DOMAIN)) throw new HttpError(409, 'Connect inbound replies before enabling automatic follow-ups.');
    if (data.sendingEnabled && emailProvider() === 'gmail') {
      try { await checkGmailIdentity(senderEmail); } catch { throw new HttpError(409, 'Gmail connection could not be verified for this sender. Check OAuth credentials and Gmail API access.'); }
    }
    await prisma.$transaction(async tx => {
      await tx.workspace.update({ where: { id: 'owner' }, data });
      if (senderEmail !== current.senderEmail || senderName !== current.senderName || data.offer !== current.offer || data.businessAddress !== current.businessAddress || replyTo !== current.replyTo) await tx.campaign.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'PAUSED' } });
      await tx.activity.create({ data: { kind: 'SETTINGS', message: 'Workspace settings updated. Sender or offer changes pause active campaigns for review.' } });
    });
    return Response.json({ success: true });
  } catch (e) { return failure(e); }
}
