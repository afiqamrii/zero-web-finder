import { checkGmailIdentity } from '@/lib/gmail';
import { workspace } from '@/lib/workspace';
export async function POST() {
  try { const settings = await workspace(); await checkGmailIdentity(settings.senderEmail); return Response.json({ success: true, email: settings.senderEmail }); }
  catch { return Response.json({ error: 'Gmail connection could not be verified. Check the OAuth setup and grant both sending and read-only access.' }, { status: 409 }); }
}
