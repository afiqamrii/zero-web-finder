import { prisma } from './prisma';
import { authConfigured } from './auth';
import { validEmail } from './domain';
import type { Workspace } from '@prisma/client';
import { emailProvider, gmailConfigured } from './gmail';
export async function workspace() { return prisma.workspace.upsert({ where: { id: 'owner' }, create: { id: 'owner', senderEmail: 'afiqamri03@gmail.com', replyTo: 'afiqamri03@gmail.com' }, update: {} }); }
export function connectionStatus(settings: Workspace) {
  let publicUrl = false;
  try { const u = new URL(process.env.PUBLIC_APP_URL ?? ''); publicUrl = u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname); } catch {}
  const gmail = emailProvider() === 'gmail';
  return { access: authConfigured(), email: gmail ? gmailConfigured() : !!process.env.RESEND_API_KEY, webhook: gmail ? gmailConfigured() : !!process.env.RESEND_WEBHOOK_SECRET, scheduler: (process.env.CRON_SECRET?.length ?? 0) >= 32, publicUrl, sender: validEmail(settings.senderEmail) && validEmail(settings.replyTo) && !!settings.businessAddress, replies: gmail ? gmailConfigured() : !!process.env.INBOUND_REPLY_DOMAIN };
}
export function sendingBlockers(settings: Workspace) { const c = connectionStatus(settings); return [!c.email && `Connect ${emailProvider() === 'gmail' ? 'Gmail' : 'Resend'}`, !c.webhook && emailProvider() === 'resend' && 'Configure delivery webhooks', !c.publicUrl && 'Set the public HTTPS address', !c.sender && 'Complete sender details', !c.access && 'Configure private access'].filter(Boolean) as string[]; }
export async function recordActivity(kind: string, message: string, entityId?: string) { return prisma.activity.create({ data: { kind, message, entityId } }); }
