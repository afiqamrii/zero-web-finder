import { prisma } from '@/lib/prisma';
import { failure, HttpError, jsonBody, str } from '@/lib/http';
import { runAutomation } from '@/lib/automation';
export const maxDuration = 300;
export async function GET() {
  try { return Response.json({ jobs: await prisma.discoveryJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) }); } catch (error) { return failure(error); }
}
export async function POST() { try { return Response.json(await runAutomation()); } catch (e) { return failure(e); } }
export async function PATCH(request: Request) {
  try {
    const d = await jsonBody(request), id = str(d.id, 'job'), action = str(d.action, 'action');
    const current = await prisma.discoveryJob.findUniqueOrThrow({ where: { id } });
    if (current.status === 'RUNNING') throw new HttpError(409, 'Wait for this search to finish.');
    if (!['pause', 'resume', 'retry'].includes(action)) throw new HttpError(400, 'Invalid action.');
    const transition = await prisma.discoveryJob.updateMany({ where: { id, status: current.status, enabled: current.enabled, nextRunAt: current.nextRunAt }, data: { enabled: action !== 'pause', ...(action !== 'pause' ? { status: 'QUEUED', nextRunAt: new Date(), error: null } : {}) } });
    if (!transition.count) throw new HttpError(409, 'This search changed in another request. Refresh and try again.');
    const job = await prisma.discoveryJob.findUniqueOrThrow({ where: { id } });
    return Response.json({ job });
  } catch (e) { return failure(e); }
}
