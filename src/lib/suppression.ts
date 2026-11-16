import { prisma } from './prisma';
import { normalizeEmail } from './domain';
export async function suppress(email: string, reason: string) {
  email = normalizeEmail(email);
  await prisma.$transaction(async tx => {
    const existing = await tx.suppression.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    await tx.suppression.upsert({ where: { email: existing?.email ?? email }, create: { email, reason }, update: { reason } });
    await tx.enrollment.updateMany({ where: { email: { equals: email, mode: 'insensitive' } }, data: { status: 'STOPPED' } });
    await tx.lead.updateMany({ where: { email: { equals: email, mode: 'insensitive' } }, data: { optedOutAt: new Date(), status: 'DO_NOT_CONTACT' } });
    await tx.emailMessage.updateMany({ where: { recipient: { equals: email, mode: 'insensitive' }, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'CANCELLED', error: reason } });
    await tx.activity.create({ data: { kind: 'SUPPRESSION', message: `${email}: ${reason}.` } });
  });
}
