export const STATUSES = ['NEW', 'CONTACTED', 'WHATSAPP_SENT', 'REPLIED', 'CALL_SCHEDULED', 'PROPOSAL_SENT', 'WON', 'CLOSED', 'LOST', 'DO_NOT_CONTACT'] as const;
export const STATUS_LABELS: Record<string, string> = { NEW: 'New lead', CONTACTED: 'Contacted', WHATSAPP_SENT: 'WhatsApp sent', REPLIED: 'Replied', CALL_SCHEDULED: 'Call booked', PROPOSAL_SENT: 'Proposal sent', WON: 'Won', CLOSED: 'Closed (legacy)', LOST: 'Lost', DO_NOT_CONTACT: 'Do not contact' };
export const STOP_STATUSES = ['REPLIED', 'CALL_SCHEDULED', 'PROPOSAL_SENT', 'WON', 'CLOSED', 'LOST', 'DO_NOT_CONTACT'];
// A single bare mailbox: display names, quoted local parts and address lists are not supported.
export const EMAIL_PATTERN = /^[\p{L}\p{N}\p{M}!#$%&'*+/=?^_`{|}~.\-]+@[\p{L}\p{N}\p{M}.\-]+\.[\p{L}\p{N}\p{M}.\-]+$/u;
export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function validEmail(value: string) {
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return false;
  const [local, domain] = value.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return domain.split('.').every(label => label.length <= 63 && /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?$/u.test(label));
}
export function leadScore(lead: { leadType: string; email?: string | null; emailVerified?: boolean; phone?: string | null; rating?: number | null; reviewCount?: number | null }) {
  return Math.min(100, (lead.leadType === 'NO_WEBSITE' ? 30 : 20) + (lead.email ? 10 : 0) + (lead.emailVerified ? 20 : 0) + (lead.phone ? 10 : 0) + ((lead.rating ?? 0) >= 4 ? 15 : 0) + ((lead.reviewCount ?? 0) >= 20 ? 15 : 0));
}
export function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}
export const TEMPLATE_KEYS = ['business', 'category', 'city', 'sender', 'offer'];
export function templateValid(template: string) {
  const stripped = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => TEMPLATE_KEYS.includes(key) ? '' : '{{invalid}}');
  return !stripped.includes('{{') && !stripped.includes('}}');
}
export function inSendingWindow(settings: { sendStartHour: number; sendEndHour: number; weekdaysOnly: boolean }, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  const day = parts.find(p => p.type === 'weekday')?.value;
  return !(settings.weekdaysOnly && (day === 'Sat' || day === 'Sun')) && hour >= settings.sendStartHour && hour < settings.sendEndHour;
}
export function malaysiaDayStart(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 3600000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 3600000);
}
export function safeWebUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export const money = (cents: number) => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', maximumFractionDigits: 0 }).format(cents / 100);
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
