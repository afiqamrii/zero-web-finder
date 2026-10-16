import { prisma } from '@/lib/prisma';
import { suppress } from '@/lib/suppression';
const page = (text: string, form = '') => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Email preferences</title><body style="font:16px system-ui;background:#f5f6f8;color:#17252a;padding:60px 20px"><main style="max-width:460px;margin:auto;background:white;padding:36px;border-radius:20px"><h1>Email preferences</h1><p>${text}</p>${form}</main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !/^[\w-]{20,80}$/.test(token)) return page('This preference link is invalid.');
  return page('Stop receiving project outreach from this sender.', `<form method="post"><input type="hidden" name="token" value="${token}"><button style="padding:12px 20px;cursor:pointer">Unsubscribe</button></form>`);
}
export async function POST(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get('token');
    const token = query || String((await request.formData()).get('token') ?? '');
    if (!/^[\w-]{20,80}$/.test(token)) return page('This preference link is invalid.');
    const enrollment = await prisma.enrollment.findUnique({ where: { token } });
    if (enrollment) await suppress(enrollment.email, 'Unsubscribed');
    return page('You have been unsubscribed. No further outreach will be sent to this address.');
  } catch { return new Response('Unable to save your preference. Please try again.', { status: 503 }); }
}
