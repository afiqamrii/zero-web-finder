import { prisma } from '@/lib/prisma';
import { failure, HttpError, integer, jsonBody, str } from '@/lib/http';
import { recordActivity } from '@/lib/workspace';
export async function POST(request: Request) {
  try {
    const d = await jsonBody(request);
    const city = str(d.city, 'city', 100), category = str(d.category, 'business type', 100);
    const mode = str(d.mode ?? 'no_website', 'search mode');
    if (!['no_website', 'outdated_website'].includes(mode)) throw new HttpError(400, 'Invalid search mode.');
    const intervalHours = integer(d.intervalHours ?? 0, 'Repeat interval', 0, 168);
    if (intervalHours > 0 && intervalHours < 6) throw new HttpError(400, 'Recurring searches must be at least 6 hours apart.');
    if (await prisma.discoveryJob.count({ where: { enabled: true } }) >= 20) throw new HttpError(409, 'Pause an existing search before adding another. Limit: 20 active searches.');
    const duplicate = await prisma.discoveryJob.findFirst({ where: { city, category, mode, enabled: true, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (duplicate) return Response.json({ job: duplicate, reused: true }, { status: 202 });
    const job = await prisma.discoveryJob.create({ data: { city, category, mode, limit: integer(d.limit ?? 10, 'Lead limit', 1, 30), intervalHours } });
    await recordActivity('DISCOVERY', `Queued ${category} in ${city}${intervalHours ? `, every ${intervalHours} hours` : ''}.`, job.id);
    return Response.json({ job }, { status: 202 });
  } catch (error) { return failure(error); }
}
