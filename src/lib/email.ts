import type { EmailMessage } from '@prisma/client';
import { sendGmail } from './gmail';
export class SendError extends Error { constructor(message: string, public retryable: boolean) { super(message); } }
export async function sendEmail(message: EmailMessage) {
  if (message.provider === 'gmail') return sendGmail(message);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `zwf/${message.id}`, 'User-Agent': 'ZeroWebFinder/1.0' },
    body: JSON.stringify({ from: message.sender, to: [message.recipient], reply_to: message.replyTo, subject: message.subject, text: `${message.body}\n\nPrefer no further emails? Unsubscribe: ${message.unsubscribeUrl}`, headers: { 'List-Unsubscribe': `<${message.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  });
  if (!response.ok) throw new SendError(`Email provider returned ${response.status}. Check the provider dashboard.`, response.status === 429 || response.status >= 500);
  const data = await response.json();
  if (typeof data.id !== 'string') throw new SendError('Provider response was incomplete; delivery needs reconciliation.', true);
  return { id: data.id as string, threadId: null };
}
