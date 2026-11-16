import { Prisma } from '@prisma/client';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 250_000;
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Enter a valid request.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString('utf8');
  try { const data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
  catch { throw new HttpError(400, 'Enter a valid request.'); }
}
export function str(value: unknown, name: string, max = 250, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new HttpError(400, `Check ${name}.`);
  return value.trim();
}
export function integer(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new HttpError(400, `${name} must be between ${min} and ${max}.`);
  return value;
}
export function boolean(value: unknown, name: string) {
  if (typeof value !== 'boolean') throw new HttpError(400, `Check ${name}.`);
  return value;
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return Response.json({ error: 'Record not found.' }, { status: 404 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return Response.json({ error: 'This record already exists.' }, { status: 409 });
  console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  return Response.json({ error: 'The database is unavailable or needs the workspace upgrade. Check setup and try again.' }, { status: 503 });
}
