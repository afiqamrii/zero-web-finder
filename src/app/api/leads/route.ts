import { prisma } from '@/lib/prisma';
import { failure, HttpError, jsonBody, str } from '@/lib/http';
import { leadScore, normalizeEmail, validEmail, safeWebUrl } from '@/lib/domain';
import { randomUUID } from 'node:crypto';
import { recordActivity } from '@/lib/workspace';
import { leadOrder, leadWhere, parseLeadFilters } from '@/lib/lead-filters';
export async function GET(request: Request) {
  try {
    const filters = parseLeadFilters(new URL(request.url).searchParams);
    const where = await leadWhere(filters);
    const result = await prisma.$transaction(async tx => {
      const total = await tx.lead.count({ where });
      const pages = Math.max(1, Math.ceil(total / 25)), page = Math.min(filters.page, pages);
      const leads = await tx.lead.findMany({ where, orderBy: leadOrder(filters.sort), skip: (page - 1) * 25, take: 25 });
      return { leads, total, page, pages };
    }, { isolationLevel: 'RepeatableRead' });
    return Response.json(result);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const data = await jsonBody(request);
    const name = str(data.name, 'business name', 200);
    const email = normalizeEmail(str(data.email ?? '', 'email', 254, false));
    if (email && !validEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (email && await prisma.lead.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) throw new HttpError(409, 'A lead with this email already exists.');
    const phone = str(data.phone ?? '', 'phone', 40, false);
    const category = str(data.category ?? 'Business', 'category', 100);
    const address = str(data.address ?? '', 'location', 300, false);
    const emailSource = str(data.emailSource ?? '', 'email source', 500, false);
    const emailVerified = data.emailVerified === true;
    if (emailVerified && (!email || !emailSource)) throw new HttpError(400, 'Add a valid email and its source before verifying it.');
    const leadType = data.leadType === 'OUTDATED_WEBSITE' ? 'OUTDATED_WEBSITE' : 'NO_WEBSITE';
    const websiteUrl = str(data.websiteUrl ?? '', 'website', 2000, false);
    if (websiteUrl && !safeWebUrl(websiteUrl)) throw new HttpError(400, 'Use an HTTP or HTTPS website link.');
    const lead = await prisma.lead.create({ data: { name, email: email || null, phone: phone || null, category, address, mapsUrl: '', placeId: `manual:${randomUUID()}`, emailSource, emailVerified, leadType, websiteUrl: websiteUrl || null, score: leadScore({ leadType, email, emailVerified, phone }) } });
    await recordActivity('LEAD', `Added ${name}.`, lead.id);
    return Response.json({ lead }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function DELETE() { return Response.json({ error: 'Archive leads as Lost or Do not contact to preserve outreach history.' }, { status: 405 }); }
