import { createHmac, timingSafeEqual } from 'node:crypto';
// Standard Webhooks / Svix: sign the exact body, accept rotating v1 signatures,
// and reject stale timestamps before processing an event.
export function verifyWebhook(body: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get('svix-id'), timestamp = headers.get('svix-timestamp'), signatures = headers.get('svix-signature');
  if (!id || !timestamp || !/^\d+$/.test(timestamp) || !signatures || !secret.startsWith('whsec_') || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error('Invalid webhook');
  const key = Buffer.from(secret.slice(6), 'base64');
  if (!key.length) throw new Error('Invalid secret');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  const valid = signatures.split(' ').some(value => { const [version, signature] = value.split(','); if (version !== 'v1' || !signature) return false; const bytes = Buffer.from(signature, 'base64'); return bytes.length === expected.length && timingSafeEqual(bytes, expected); });
  if (!valid) throw new Error('Invalid webhook');
  return JSON.parse(body) as unknown;
}
