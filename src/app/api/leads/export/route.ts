import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/domain';
import { failure, HttpError } from '@/lib/http';
import { leadOrder, leadWhere, parseLeadFilters } from '@/lib/lead-filters';
export async function GET(request: Request) {
  try {
    const filters = parseLeadFilters(new URL(request.url).searchParams);
    const where = await leadWhere(filters);
    const rows = await prisma.lead.findMany({ where, take: 10001, orderBy: leadOrder(filters.sort), select: { name: true, email: true, phone: true, category: true, address: true, status: true, score: true, dealValueCents: true, revenueCents: true, notes: true } });
    if (rows.length > 10000) throw new HttpError(400, 'This export exceeds 10,000 leads. Narrow your filters and export again.');
    const csv = [['Business', 'Email', 'Phone', 'Category', 'Location', 'Stage', 'Score', 'Deal value (MYR)', 'Revenue collected (MYR)', 'Notes'].map(csvCell).join(','), ...rows.map(r => [r.name, r.email, r.phone, r.category, r.address, r.status, r.score, r.dealValueCents / 100, r.revenueCents / 100, r.notes].map(csvCell).join(','))].join('\r\n');
    return new Response('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="zero-web-leads.csv"', 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
