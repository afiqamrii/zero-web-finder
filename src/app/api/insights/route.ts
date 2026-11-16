import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { failure } from '@/lib/http';
import { normalizeEmail } from '@/lib/domain';
import { analyzeOpportunity, OPEN_OPPORTUNITY_STAGES, OPPORTUNITY_RESULT_LIMIT, OPPORTUNITY_SCAN_LIMIT, OPPORTUNITY_VERSION, rankOpportunities, type InsightsResponse, type OpportunityLead } from '@/lib/opportunity';

export async function GET() {
  try {
    const where: Prisma.LeadWhereInput = { status: { in: OPEN_OPPORTUNITY_STAGES }, optedOutAt: null };
    const [totalOpen, rows, settings] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: OPPORTUNITY_SCAN_LIMIT, select: {
        id: true, name: true, category: true, address: true, leadType: true, status: true,
        email: true, emailVerified: true, emailSource: true, phone: true, websiteUrl: true, mapsUrl: true,
        rating: true, reviewCount: true, notes: true, demoUrl: true, optedOutAt: true, updatedAt: true,
        lastContactedAt: true, dealValueCents: true, enrollment: { select: { id: true } },
      } }),
      prisma.workspace.findUnique({ where: { id: 'owner' }, select: { senderName: true, offer: true } }),
    ]);
    const emails = [...new Set(rows.map(row => normalizeEmail(row.email || '')).filter(Boolean))];
    // Bound lookups to the scanned mailboxes while matching legacy casing/whitespace.
    const [suppressed, enrolled, duplicates] = emails.length ? await Promise.all([
      prisma.$queryRaw<{ email: string }[]>`SELECT lower(btrim("email")) AS email FROM "Suppression" WHERE lower(btrim("email")) IN (${Prisma.join(emails)})`,
      prisma.$queryRaw<{ email: string }[]>`SELECT lower(btrim("email")) AS email FROM "Enrollment" WHERE lower(btrim("email")) IN (${Prisma.join(emails)})`,
      prisma.$queryRaw<{ email: string; count: bigint }[]>`SELECT lower(btrim("email")) AS email, count(*) AS count FROM "Lead" WHERE lower(btrim("email")) IN (${Prisma.join(emails)}) GROUP BY lower(btrim("email")) HAVING count(*) > 1`,
    ]) : [[], [], []];
    const suppressedSet = new Set(suppressed.map(row => row.email)), enrolledSet = new Set(enrolled.map(row => row.email)), duplicateSet = new Set(duplicates.map(row => row.email));
    const analyses = rows.map(row => {
      const email = normalizeEmail(row.email || '');
      // Imported legacy text can be large. Keep the response and generated briefs bounded.
      const { enrollment, ...saved } = row;
      const lead: OpportunityLead = { ...saved, name: row.name.slice(0, 200), category: row.category.slice(0, 100), address: row.address.slice(0, 300), leadType: row.leadType.slice(0, 50), email: row.email && row.email.length <= 254 ? row.email : null, phone: row.phone?.slice(0, 40) ?? null, notes: row.notes?.slice(0, 800) ?? null, emailSource: row.emailSource?.slice(0, 500) ?? null, websiteUrl: row.websiteUrl?.slice(0, 2000) ?? null, mapsUrl: row.mapsUrl.slice(0, 2000), demoUrl: row.demoUrl?.slice(0, 2000) ?? null };
      return { lead, analysis: analyzeOpportunity(lead, { suppression: suppressedSet.has(email) ? 'blocked' : 'clear', previouslyEnrolled: !!enrollment || enrolledSet.has(email), duplicateContact: duplicateSet.has(email), senderName: settings?.senderName, offer: settings?.offer }) };
    });
    const ranked = rankOpportunities(analyses);
    const categories = new Map<string, number>();
    for (const item of ranked) categories.set(item.lead.category || 'Uncategorized', (categories.get(item.lead.category || 'Uncategorized') || 0) + 1);
    const response: InsightsResponse = {
      version: OPPORTUNITY_VERSION, generatedAt: new Date().toISOString(), mode: 'local-rules',
      coverage: { totalOpen, scanned: rows.length, ranked: ranked.length, returned: Math.min(ranked.length, OPPORTUNITY_RESULT_LIMIT), excluded: analyses.length - ranked.length, scanLimit: OPPORTUNITY_SCAN_LIMIT, resultLimit: OPPORTUNITY_RESULT_LIMIT, scanCapped: totalOpen > OPPORTUNITY_SCAN_LIMIT, resultCapped: ranked.length > OPPORTUNITY_RESULT_LIMIT, selection: 'Most recently updated open leads; closed and opted-out records are excluded before scanning. Suppressed records are removed after the scan.' },
      summary: {
        ready: ranked.filter(item => item.analysis.nextAction.group === 'outreach').length,
        research: ranked.filter(item => item.analysis.nextAction.group === 'research').length,
        conversations: ranked.filter(item => item.analysis.nextAction.group === 'conversation').length,
        averageScore: ranked.length ? Math.round(ranked.reduce((sum, item) => sum + item.analysis.score, 0) / ranked.length) : 0,
        categories: [...categories].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 6),
      },
      opportunities: ranked.slice(0, OPPORTUNITY_RESULT_LIMIT),
    };
    return Response.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
