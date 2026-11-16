import { prisma } from '@/lib/prisma';
import { failure, HttpError, integer, jsonBody, str, boolean } from '@/lib/http';
import { STATUSES, STOP_STATUSES, leadScore, normalizeEmail, validEmail, safeWebUrl } from '@/lib/domain';
import type { Prisma } from '@prisma/client';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return Response.json({ lead: await prisma.lead.findUniqueOrThrow({ where: { id } }) }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = await jsonBody(request);
    const current = await prisma.lead.findUniqueOrThrow({ where: { id } });
    const allowed = ['expectedUpdatedAt', 'name', 'category', 'address', 'phone', 'websiteUrl', 'leadType', 'status', 'notes', 'email', 'emailVerified', 'emailSource', 'isStarred', 'dealValueCents', 'revenueCents', 'demoUrl'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new HttpError(400, 'Unsupported lead field.');
    const data: Prisma.LeadUpdateInput = {};
    const expectedUpdatedAt = 'expectedUpdatedAt' in input ? new Date(str(input.expectedUpdatedAt, 'last saved version', 40)) : null;
    if (expectedUpdatedAt && !Number.isFinite(expectedUpdatedAt.getTime())) throw new HttpError(400, 'Check the last saved version.');
    if (expectedUpdatedAt && expectedUpdatedAt.getTime() !== current.updatedAt.getTime()) throw new HttpError(409, 'This lead changed while you were editing. Copy your notes, then reopen it to see the latest details.');
    if ('name' in input) data.name = str(input.name, 'business name', 200);
    if ('category' in input) data.category = str(input.category, 'business type', 100);
    if ('address' in input) data.address = str(input.address, 'location', 300, false);
    if ('phone' in input) data.phone = str(input.phone, 'phone', 40, false) || null;
    if ('websiteUrl' in input) { const url = str(input.websiteUrl, 'website', 2000, false); if (url && !safeWebUrl(url)) throw new HttpError(400, 'Use an HTTP or HTTPS website link.'); data.websiteUrl = url || null; }
    if ('leadType' in input) { const type = str(input.leadType, 'opportunity'); if (!['NO_WEBSITE', 'OUTDATED_WEBSITE'].includes(type)) throw new HttpError(400, 'Choose a valid opportunity.'); data.leadType = type; }
    if ('status' in input) { const status = str(input.status, 'status'); if (!(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, 'Invalid stage.'); data.status = status; }
    if ('notes' in input) data.notes = str(input.notes, 'notes', 5000, false);
    if ('emailSource' in input) data.emailSource = str(input.emailSource, 'email source', 500, false);
    if ('demoUrl' in input) { const url = str(input.demoUrl, 'demo link', 2000, false); if (url && !safeWebUrl(url)) throw new HttpError(400, 'Use an HTTP or HTTPS demo link.'); data.demoUrl = url || null; }
    if ('isStarred' in input) data.isStarred = boolean(input.isStarred, 'priority');
    if ('email' in input) {
      const email = normalizeEmail(str(input.email, 'email', 254, false));
      if (email && !validEmail(email)) throw new HttpError(400, 'Enter a valid email.');
      if (email && email !== normalizeEmail(current.email ?? '') && await prisma.lead.findFirst({ where: { id: { not: id }, email: { equals: email, mode: 'insensitive' } } })) throw new HttpError(409, 'A lead with this email already exists. Open that lead instead.');
      data.email = email || null;
      if (email !== normalizeEmail(current.email ?? '')) data.emailVerified = false;
    }
    if ('emailVerified' in input) {
      data.emailVerified = boolean(input.emailVerified, 'email verification');
      if (data.emailVerified) {
        const email = normalizeEmail('email' in input ? (typeof data.email === 'string' ? data.email : '') : current.email ?? '');
        if (!validEmail(email)) throw new HttpError(400, 'Add a valid email before verifying it.');
        data.email = email;
      }
    }
    if ('dealValueCents' in input) data.dealValueCents = integer(input.dealValueCents, 'Deal value', 0, 100000000);
    if ('revenueCents' in input) data.revenueCents = integer(input.revenueCents, 'Collected revenue', 0, 100000000);
    const merged = { ...current, ...data } as typeof current;
    if (merged.emailVerified && (!merged.email || !validEmail(merged.email) || !merged.emailSource?.trim())) throw new HttpError(400, 'Add a valid email and source before verifying it.');
    if (merged.status === 'DO_NOT_CONTACT') data.optedOutAt = new Date();
    data.score = leadScore(merged);
    const lead = await prisma.$transaction(async tx => {
      const updated = await tx.lead.update({ where: { id, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) }, data }).catch(error => {
        if (expectedUpdatedAt && error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new HttpError(409, 'This lead changed while you were editing. Copy your notes, then reopen it to see the latest details.');
        throw error;
      });
      if (STOP_STATUSES.includes(updated.status) || updated.email !== current.email || !updated.emailVerified) {
        await tx.enrollment.updateMany({ where: { leadId: id }, data: { status: updated.status === 'REPLIED' ? 'REPLIED' : 'STOPPED' } });
        await tx.emailMessage.updateMany({ where: { enrollment: { leadId: id }, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'CANCELLED', error: 'Lead status or contact details changed.' } });
      }
      if (updated.status === 'DO_NOT_CONTACT' && updated.email) await tx.suppression.upsert({ where: { email: updated.email }, create: { email: updated.email, reason: 'Owner marked do not contact' }, update: {} });
      await tx.activity.create({ data: { kind: 'LEAD', message: `Updated ${updated.name}${input.status ? `: ${updated.status.replaceAll('_', ' ').toLowerCase()}` : ''}.`, entityId: id } });
      return updated;
    });
    return Response.json({ lead });
  } catch (error) { return failure(error); }
}
export async function DELETE() { return Response.json({ error: 'Archive this lead as Lost to preserve its outreach history.' }, { status: 405 }); }
