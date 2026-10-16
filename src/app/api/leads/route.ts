import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { failure, HttpError, jsonBody, str } from '@/lib/http';
import { leadScore, normalizeEmail, validEmail } from '@/lib/domain';
import { randomUUID } from 'node:crypto';
import { recordActivity } from '@/lib/workspace';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(100000, Math.floor(Number(p.get('page')) || 1)));
    const q = (p.get('q') ?? '').slice(0, 100).trim();
    const where: Prisma.LeadWhereInput = { ...(p.get('status') && p.get('status') !== 'ALL' ? { status: p.get('status')! } : {}), ...(p.get('type') && p.get('type') !== 'ALL' ? { leadType: p.get('type')! } : {}), ...(p.get('starred') === 'true' ? { isStarred: true } : {}), ...(q ? { OR: ['name', 'category', 'address', 'email', 'phone'].map(key => ({ [key]: { contains: q, mode: 'insensitive' } })) } : {}) };
    const [leads, total] = await prisma.$transaction([prisma.lead.findMany({ where, orderBy: [{ isStarred: 'desc' }, { score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 }), prisma.lead.count({ where })]);
    return Response.json({ leads, total, page, pages: Math.max(1, Math.ceil(total / 25)) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const data = await jsonBody(request);
    const name = str(data.name, 'business name', 200);
    const email = normalizeEmail(str(data.email ?? '', 'email', 254, false));
    if (email && !validEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (email && await prisma.lead.findFirst({ where: { email } })) throw new HttpError(409, 'A lead with this email already exists.');
    const phone = str(data.phone ?? '', 'phone', 40, false);
    const category = str(data.category ?? 'Business', 'category', 100);
    const address = str(data.address ?? '', 'location', 300, false);
    const emailSource = str(data.emailSource ?? '', 'email source', 500, false);
    const emailVerified = data.emailVerified === true;
    if (emailVerified && (!email || !emailSource)) throw new HttpError(400, 'Add a valid email and its source before verifying it.');
    const leadType = data.leadType === 'OUTDATED_WEBSITE' ? 'OUTDATED_WEBSITE' : 'NO_WEBSITE';
    const lead = await prisma.lead.create({ data: { name, email: email || null, phone: phone || null, category, address, mapsUrl: '', placeId: `manual:${randomUUID()}`, emailSource, emailVerified, leadType, score: leadScore({ leadType, email, emailVerified, phone }) } });
    await recordActivity('LEAD', `Added ${name}.`, lead.id);
    return Response.json({ lead }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function DELETE() { return Response.json({ error: 'Archive leads as Lost or Do not contact to preserve outreach history.' }, { status: 405 }); }
