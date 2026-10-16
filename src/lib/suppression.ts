import { prisma } from './prisma';
export async function suppress(email: string, reason: string) {
  await prisma.$transaction(async tx => {
    await tx.suppression.upsert({ where: { email }, create: { email, reason }, update: { reason } });
    await tx.enrollment.updateMany({ where: { email }, data: { status: 'STOPPED' } });
    await tx.lead.updateMany({ where: { email }, data: { optedOutAt: new Date(), status: 'DO_NOT_CONTACT' } });
    await tx.emailMessage.updateMany({ where: { recipient: email, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'CANCELLED', error: reason } });
    await tx.activity.create({ data: { kind: 'SUPPRESSION', message: `${email}: ${reason}.` } });
  });
}
