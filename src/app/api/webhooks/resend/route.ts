import { verifyWebhook } from '@/lib/webhook-signature';
import { prisma } from '@/lib/prisma';
import { failure } from '@/lib/http';
import { normalizeEmail } from '@/lib/domain';
type Event = { type: string; data: { email_id?: string; from?: string; to?: string[] } };
export async function POST(request: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET) return Response.json({ error: 'Webhook unavailable' }, { status: 503 });
  const body = await request.text();
  if (body.length > 500000) return Response.json({ error: 'Payload too large' }, { status: 413 });
  const id = request.headers.get('svix-id') ?? '';
  let event: Event;
  try { event = verifyWebhook(body, request.headers, process.env.RESEND_WEBHOOK_SECRET) as Event; }
  catch { return Response.json({ error: 'Invalid signature' }, { status: 401 }); }
  if (!event?.data || typeof event.type !== 'string') return Response.json({ error: 'Invalid event' }, { status: 400 });
  try {
    if (await prisma.webhookEvent.findUnique({ where: { id } })) return Response.json({ received: true });
    if (event.type === 'email.received') {
      const from = normalizeEmail((event.data.from ?? '').match(/<([^>]+)>/)?.[1] ?? event.data.from ?? '');
      const tokens = (event.data.to ?? []).flatMap(address => {
        const match = address.match(/reply\+([\w-]+)@([^>\s]+)/i);
        return match && match[2].toLowerCase() === process.env.INBOUND_REPLY_DOMAIN?.toLowerCase() ? [match[1]] : [];
      });
      const enrollment = await prisma.enrollment.findFirst({ where: { email: from, token: { in: tokens } } });
      await prisma.$transaction(async tx => {
        await tx.webhookEvent.create({ data: { id } });
        if (!enrollment) return;
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: 'REPLIED' } });
        await tx.lead.updateMany({ where: { id: enrollment.leadId, status: { in: ['NEW', 'CONTACTED', 'WHATSAPP_SENT'] } }, data: { status: 'REPLIED' } });
        await tx.emailMessage.updateMany({ where: { enrollmentId: enrollment.id, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'CANCELLED', error: 'Reply received.' } });
        await tx.activity.create({ data: { kind: 'REPLY', message: `Reply received from ${enrollment.email}. Follow-ups stopped. Read it in the Resend inbox.`, entityId: enrollment.leadId } });
      });
      return Response.json({ received: true });
    }
    const supported = ['email.delivered', 'email.bounced', 'email.complained', 'email.failed'];
    if (!supported.includes(event.type)) return Response.json({ received: true });
    const message = event.data.email_id ? await prisma.emailMessage.findUnique({ where: { providerId: event.data.email_id } }) : null;
    // Let the provider retry an event that races the send acknowledgement commit.
    if (!message) return Response.json({ error: 'Awaiting send acknowledgement' }, { status: 503 });
    await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({ data: { id } });
      if (event.type === 'email.delivered') {
        await tx.emailMessage.updateMany({ where: { id: message.id, status: { in: ['SENT', 'SENDING'] } }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      } else {
        const status = event.type === 'email.complained' ? 'COMPLAINED' : event.type === 'email.bounced' ? 'BOUNCED' : 'FAILED';
        await tx.emailMessage.update({ where: { id: message.id }, data: { status, error: event.type } });
        await tx.suppression.upsert({ where: { email: message.recipient }, create: { email: message.recipient, reason: status }, update: { reason: status } });
        await tx.enrollment.updateMany({ where: { email: message.recipient }, data: { status: 'STOPPED' } });
        await tx.lead.updateMany({ where: { email: message.recipient }, data: { optedOutAt: new Date(), status: 'DO_NOT_CONTACT' } });
        await tx.emailMessage.updateMany({ where: { recipient: message.recipient, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'CANCELLED', error: status } });
      }
      await tx.activity.create({ data: { kind: 'DELIVERY', message: `${message.recipient}: ${event.type.replace('email.', '')}.`, entityId: message.id } });
    });
    return Response.json({ received: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return Response.json({ received: true });
    return failure(error);
  }
}
