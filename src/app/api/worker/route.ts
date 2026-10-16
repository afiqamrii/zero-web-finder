import { equalSecret } from '@/lib/auth';
import { runAutomation } from '@/lib/automation';
import { failure } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !equalSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json(await runAutomation()); } catch (error) { return failure(error); }
}
