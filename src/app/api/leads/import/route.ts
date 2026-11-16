import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { failure, HttpError } from '@/lib/http';
import { leadScore } from '@/lib/domain';
import { IMPORT_REQUEST_MAX_BYTES, importReport, parseLeadImport } from '@/lib/lead-import';

async function boundedBody(request: Request) {
  if (Number(request.headers.get('content-length')) > IMPORT_REQUEST_MAX_BYTES) throw new HttpError(413, 'Import request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Choose a CSV file or paste its contents first.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > IMPORT_REQUEST_MAX_BYTES) { await reader.cancel(); throw new HttpError(413, 'Import request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Enter a valid import request.'); }
}

export async function POST(request: Request) {
  try {
    const body = await boundedBody(request);
    if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') throw new HttpError(400, 'Choose preview or import explicitly.');
    const dryRun = body.dryRun !== false;
    const { rows, ignoredHeaders } = parseLeadImport(body.csv);
    const result = await prisma.$transaction(async tx => {
      const ready = rows.filter(row => row.status === 'ready');
      const emails = ready.map(row => row.values.email).filter(Boolean);
      const existingEmails = emails.length ? await tx.$queryRaw<{ email: string }[]>(Prisma.sql`SELECT DISTINCT lower(btrim("email")) AS email FROM "Lead" WHERE lower(btrim("email")) IN (${Prisma.join(emails)})`) : [];
      const existingPlaces = ready.length ? await tx.lead.findMany({ where: { placeId: { in: ready.map(row => row.placeId) } }, select: { placeId: true } }) : [];
      const emailSet = new Set(existingEmails.map(row => row.email)), placeSet = new Set(existingPlaces.map(row => row.placeId));
      for (const row of ready) {
        if (row.values.email && emailSet.has(row.values.email)) { row.status = 'duplicate'; row.issues.push('This email is already in your workspace. The existing lead will be kept.'); }
        else if (placeSet.has(row.placeId)) { row.status = 'duplicate'; row.issues.push('This business was already imported. The existing lead will be kept.'); }
      }
      const additions = rows.filter(row => row.status === 'ready');
      if (!dryRun && additions.length) {
        const created = await tx.lead.createMany({ data: additions.map(({ values, placeId }) => {
          const leadType = values.websiteUrl ? 'OUTDATED_WEBSITE' : 'NO_WEBSITE';
          return { ...values, placeId, email: values.email || null, phone: values.phone || null, websiteUrl: values.websiteUrl || null, mapsUrl: '', status: 'NEW', emailVerified: false, leadType, score: leadScore({ ...values, leadType, emailVerified: false }) };
        }), skipDuplicates: true });
        if (created.count !== additions.length) throw new HttpError(409, 'Your leads changed during import. Preview the file again; no partial import was saved.');
        await tx.activity.create({ data: { kind: 'LEAD', message: `Imported ${created.count} new leads from CSV. Contact emails still need verification.` } });
        additions.forEach(row => { row.status = 'imported'; });
      }
      return importReport(rows, ignoredHeaders, dryRun);
    }, { isolationLevel: dryRun ? 'RepeatableRead' : 'Serializable', timeout: 15000 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return Response.json({ error: 'Your leads changed during import. Preview the file again; no partial import was saved.' }, { status: 409 });
    return failure(error);
  }
}
