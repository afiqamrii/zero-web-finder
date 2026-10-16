import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/domain';
import { failure } from '@/lib/http';
export async function GET() {
  try {
    const rows = await prisma.lead.findMany({ take: 10000, orderBy: { createdAt: 'desc' }, select: { name: true, email: true, phone: true, category: true, address: true, status: true, score: true, dealValueCents: true, revenueCents: true, notes: true } });
    const csv = [['Business', 'Email', 'Phone', 'Category', 'Location', 'Stage', 'Score', 'Deal value (MYR)', 'Revenue collected (MYR)', 'Notes'].map(csvCell).join(','), ...rows.map(r => [r.name, r.email, r.phone, r.category, r.address, r.status, r.score, r.dealValueCents / 100, r.revenueCents / 100, r.notes].map(csvCell).join(','))].join('\r\n');
    return new Response('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="zero-web-leads.csv"', 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
