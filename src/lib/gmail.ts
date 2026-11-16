import { prisma } from './prisma';
import { normalizeEmail, validEmail } from './domain';
import type { EmailMessage } from '@prisma/client';

export const emailProvider = () => process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'gmail';
export function gmailConfigured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN); }
let tokenCache: { value: string; until: number; credentials: string } | null = null;
export async function gmailToken() {
  const credentials = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GMAIL_REFRESH_TOKEN].join('\0');
  if (tokenCache && tokenCache.credentials === credentials && tokenCache.until > Date.now()) return tokenCache.value;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? '', grant_type: 'refresh_token' }) });
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== 'string') throw new Error('Gmail connection failed. Reconnect the owner account.');
  tokenCache = { value: data.access_token, until: Date.now() + Math.max(0, (Number(data.expires_in) || 3600) - 120) * 1000, credentials };
  return tokenCache.value;
}
export async function gmailRequest(path: string, init?: RequestInit) {
  const token = await gmailToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) throw new Error(`Gmail returned ${response.status}. Check the Google connection.`);
  return response.json();
}
export async function checkGmailIdentity(sender: string) {
  if (!validEmail(sender)) throw new Error('Use one valid sender email address.');
  const profile = await gmailRequest('profile');
  const address = typeof profile.emailAddress === 'string' ? normalizeEmail(profile.emailAddress) : '';
  if (!validEmail(address) || address !== normalizeEmail(sender)) throw new Error('Connected Gmail account does not match the workspace sender.');
}
function gmailAddresses(message: EmailMessage) {
  const display = message.sender.match(/^(.*?)\s*<([^<>]+)>$/);
  const mailbox = display?.[2] ?? message.sender;
  const name = display?.[1] ?? mailbox;
  if (/[<>\r\n]/.test(name) || !validEmail(mailbox) || !validEmail(message.recipient) || !validEmail(message.replyTo)) throw new Error('Gmail requires one valid sender, recipient and reply-to email address.');
  return { mailbox, name };
}
export function gmailMime(message: EmailMessage, replyToMessageId?: string) {
  const encoded = (s: string) => `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
  const { mailbox, name } = gmailAddresses(message);
  const lines = [
    `From: ${encoded(name)} <${mailbox}>`, `To: ${message.recipient}`, `Reply-To: ${message.replyTo}`,
    `Subject: ${encoded(message.subject)}`, `Message-ID: <zwf.${message.id}@zero-web-finder.local>`,
    ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    `List-Unsubscribe: <${message.unsubscribeUrl}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click', '',
    Buffer.from(`${message.body}\n\nPrefer no further emails? Unsubscribe: ${message.unsubscribeUrl}`).toString('base64').match(/.{1,76}/g)!.join('\r\n'),
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}
export async function sendGmail(message: EmailMessage) {
  const { mailbox } = gmailAddresses(message);
  await checkGmailIdentity(mailbox);
  let threadId: string | undefined, replyToMessageId: string | undefined;
  if (message.step === 1) {
    const first = await prisma.emailMessage.findUnique({ where: { enrollmentId_step: { enrollmentId: message.enrollmentId, step: 0 } } });
    if (!first?.threadId || !first.sentAt || first.provider !== 'gmail' || first.subject !== message.subject) throw new Error('The original Gmail conversation could not be verified. Review this follow-up before sending.');
    threadId = first.threadId;
    replyToMessageId = `<zwf.${first.id}@zero-web-finder.local>`;
  }
  const data = await gmailRequest('messages/send', { method: 'POST', body: JSON.stringify({ raw: gmailMime(message, replyToMessageId), ...(threadId ? { threadId } : {}) }) });
  if (typeof data.id !== 'string' || typeof data.threadId !== 'string') throw new Error('Gmail did not return a delivery acknowledgement.');
  return { id: data.id as string, threadId: data.threadId as string };
}
export async function checkGmailReplies() {
  // Check all open Gmail conversations before any follow-up is permitted. Fail
  // closed on an API error rather than risking a follow-up after an unseen reply.
  const messages = await prisma.emailMessage.findMany({ where: { provider: 'gmail', step: 0, threadId: { not: null }, sentAt: { not: null }, enrollment: { status: 'ACTIVE' } }, select: { threadId: true, providerId: true, recipient: true, enrollmentId: true, sentAt: true, enrollment: { select: { leadId: true } } }, take: 20, orderBy: { enrollment: { lastReplyCheckAt: { sort: 'asc', nulls: 'first' } } } });
  const checked = new Set<string>();
  const start = Date.now();
  for (const message of messages) {
    if (Date.now() - start > 60000) break;
    const thread = await gmailRequest(`threads/${encodeURIComponent(message.threadId!)}?format=metadata&metadataHeaders=From`);
    const replied = (thread.messages ?? []).some((m: { id: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }) => {
      const from = m.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value ?? '';
      const email = normalizeEmail(from.match(/<([^>]+)>/)?.[1] ?? from);
      return m.id !== message.providerId && email === message.recipient && Number(m.internalDate) >= message.sentAt!.getTime() - 60000;
    });
    await prisma.enrollment.update({ where: { id: message.enrollmentId }, data: { lastReplyCheckAt: new Date() } });
    checked.add(message.enrollmentId);
    if (replied) await prisma.$transaction(async tx => {
      await tx.enrollment.update({ where: { id: message.enrollmentId }, data: { status: 'REPLIED' } });
      await tx.lead.updateMany({ where: { id: message.enrollment.leadId, status: { in: ['NEW', 'CONTACTED', 'WHATSAPP_SENT'] } }, data: { status: 'REPLIED' } });
      await tx.emailMessage.updateMany({ where: { enrollmentId: message.enrollmentId, status: { in: ['QUEUED', 'RETRY'] } }, data: { status: 'CANCELLED', error: 'Gmail reply received.' } });
      await tx.activity.create({ data: { kind: 'REPLY', message: `${message.recipient} replied. Follow-ups stopped. Read the conversation in Gmail.`, entityId: message.enrollment.leadId } });
    });
  }
  return checked;
}
