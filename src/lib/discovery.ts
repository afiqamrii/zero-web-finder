import { prisma } from './prisma';
import { scrapeGoogleMaps } from './scraper';
import { leadScore, normalizeEmail, validEmail } from './domain';
import { recordActivity } from './workspace';
export async function runDiscovery() {
  await prisma.discoveryJob.updateMany({ where: { status: 'RUNNING', lastRunAt: { lt: new Date(Date.now() - 600000) } }, data: { status: 'FAILED', error: 'Search interrupted. It will retry on its next scheduled run.' } });
  const job = await prisma.discoveryJob.findFirst({ where: { enabled: true, nextRunAt: { lte: new Date() }, status: { not: 'RUNNING' } }, orderBy: { nextRunAt: 'asc' } });
  if (!job) return 0;
  const claimed = await prisma.discoveryJob.updateMany({ where: { id: job.id, status: job.status, enabled: true }, data: { status: 'RUNNING', lastRunAt: new Date(), error: null } });
  if (!claimed.count) return 0;
  try {
    const leads = await scrapeGoogleMaps({ city: job.city, category: job.category, limit: job.limit, mode: job.mode as 'no_website' | 'outdated_website' });
    for (let i = 0; i < leads.length; i += 5) await Promise.all(leads.slice(i, i + 5).map(async item => {
      const existing = await prisma.lead.findUnique({ where: { placeId: item.placeId } });
      const extracted = item.email ? normalizeEmail(item.email) : null;
      const email = extracted && validEmail(extracted) ? extracted : null;
      const contact = { ...item, email, emailSource: email ? (item.websiteUrl || item.mapsUrl) : null, score: leadScore({ ...item, email }) };
      // Discovery refreshes observed facts; verified contacts, notes and deal history remain owned by the user.
      const observations = { ...item, email: undefined, phone: undefined, originalPhone: undefined };
      await prisma.lead.upsert({ where: { placeId: item.placeId }, create: contact, update: { ...observations, score: leadScore({ ...item, email: existing?.email, emailVerified: existing?.emailVerified, phone: existing?.phone }) } });
    }));
    await prisma.discoveryJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', resultCount: leads.length, enabled: job.intervalHours > 0, nextRunAt: new Date(Date.now() + (job.intervalHours || 24) * 3600000) } });
    await recordActivity('DISCOVERY', `${job.category} in ${job.city}: ${leads.length} leads found or refreshed.`, job.id);
    return leads.length;
  } catch {
    await prisma.discoveryJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'Search could not complete. Google may be unavailable or Chromium needs installation. Retry from Automations.', enabled: job.intervalHours > 0, nextRunAt: new Date(Date.now() + (job.intervalHours || 1) * 3600000) } });
    await recordActivity('ERROR', `Discovery failed: ${job.category} in ${job.city}.`, job.id);
    return 0;
  }
}
