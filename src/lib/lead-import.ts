import Papa from 'papaparse';
import { createHash } from 'node:crypto';
import { HttpError } from './http';
import { normalizeEmail, validEmail } from './domain';

export const IMPORT_MAX_ROWS = 200;
export const IMPORT_MAX_BYTES = 120_000;
export const IMPORT_REQUEST_MAX_BYTES = 250_000;

const aliases: Record<string, string> = {
  name: 'name', business: 'name', businessname: 'name', company: 'name', companyname: 'name',
  category: 'category', businesstype: 'category', industry: 'category',
  address: 'address', location: 'address', city: 'address',
  email: 'email', emailaddress: 'email', contactemail: 'email',
  phone: 'phone', telephone: 'phone', tel: 'phone', phonenumber: 'phone',
  website: 'websiteUrl', websiteurl: 'websiteUrl', url: 'websiteUrl',
  source: 'emailSource', emailsource: 'emailSource', contactsource: 'emailSource',
  notes: 'notes', note: 'notes',
};
export type ImportValues = {
  name: string; category: string; address: string; email: string; phone: string;
  websiteUrl: string; emailSource: string; notes: string;
};
export type ImportRow = { row: number; values: ImportValues; placeId: string; status: 'ready' | 'invalid' | 'duplicate' | 'imported'; issues: string[] };
export type ImportReport = {
  dryRun: boolean; ignoredHeaders: string[];
  summary: { total: number; ready: number; invalid: number; duplicates: number; imported: number };
  rows: Omit<ImportRow, 'placeId'>[];
};

function checkedUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !!parsed.hostname ? parsed.href : null;
  } catch { return null; }
}
function identity(values: ImportValues) {
  const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const signature = [normalize(values.name), normalize(values.address), values.email, values.phone.replace(/[^\d+]/g, ''), normalize(values.websiteUrl)];
  return `csv:${createHash('sha256').update(JSON.stringify(signature)).digest('hex')}`;
}

export function parseLeadImport(csv: unknown) {
  if (typeof csv !== 'string' || !csv.trim()) throw new HttpError(400, 'Choose a CSV file or paste its contents first.');
  if (Buffer.byteLength(csv, 'utf8') > IMPORT_MAX_BYTES) throw new HttpError(413, 'Use a CSV file smaller than 120 KB.');
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: 'greedy', preview: IMPORT_MAX_ROWS + 2 });
  if (parsed.errors.length) throw new HttpError(400, 'The CSV has invalid quoting or formatting. Check it before importing.');
  const [headers, ...records] = parsed.data;
  if (!headers?.length || !records.length) throw new HttpError(400, 'Include a header row and at least one business.');
  if (headers.length > 30 || headers.some(header => header.length > 100)) throw new HttpError(400, 'Use no more than 30 short column headings.');
  if (records.length > IMPORT_MAX_ROWS) throw new HttpError(413, 'Import up to 200 businesses at a time.');
  const mapped = headers.map(header => { const key = header.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); return Object.hasOwn(aliases, key) ? aliases[key] : undefined; });
  if (!mapped.includes('name')) throw new HttpError(400, 'Add a name, business name, or company column.');
  const recognized = mapped.filter(Boolean);
  if (new Set(recognized).size !== recognized.length) throw new HttpError(400, 'Two columns map to the same field. Keep one column for each business detail.');
  const ignoredHeaders = headers.filter((_, index) => !mapped[index]);
  const seenEmails = new Set<string>(), seenIdentities = new Set<string>();
  const rows: ImportRow[] = records.map((record, index) => {
    const values: ImportValues = { name: '', category: 'Business', address: '', email: '', phone: '', websiteUrl: '', emailSource: '', notes: '' };
    mapped.forEach((field, column) => { if (field) values[field as keyof ImportValues] = (record[column] ?? '').trim(); });
    values.category ||= 'Business';
    values.email = normalizeEmail(values.email);
    const issues: string[] = [];
    if (record.length !== headers.length) issues.push('The number of values does not match the header.');
    if (!values.name) issues.push('Business name is required.');
    const limits: Record<keyof ImportValues, number> = { name: 200, category: 100, address: 300, email: 254, phone: 40, websiteUrl: 2000, emailSource: 500, notes: 3000 };
    for (const [key, maximum] of Object.entries(limits)) {
      const value = values[key as keyof ImportValues];
      if (value.length > maximum) issues.push(`${key}: use at most ${maximum} characters.`);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) issues.push(`${key}: remove control characters.`);
    }
    if (values.email && !validEmail(values.email)) issues.push('Enter a valid email address.');
    if (values.websiteUrl) {
      const website = checkedUrl(values.websiteUrl);
      if (!website) issues.push('Website must be a complete HTTP or HTTPS link without login details.');
      else values.websiteUrl = website;
    }
    // Source is a plain-text provenance note, never an executable or linked URL.
    const placeId = identity(values);
    let status: ImportRow['status'] = issues.length ? 'invalid' : 'ready';
    if (status === 'ready') {
      if (values.email && seenEmails.has(values.email)) { status = 'duplicate'; issues.push('Email already appears in an earlier valid row.'); }
      else if (seenIdentities.has(placeId)) { status = 'duplicate'; issues.push('This business already appears in an earlier valid row.'); }
      else { if (values.email) seenEmails.add(values.email); seenIdentities.add(placeId); }
    }
    return { row: index + 2, values, placeId, status, issues };
  });
  return { rows, ignoredHeaders };
}

export function importReport(rows: ImportRow[], ignoredHeaders: string[], dryRun: boolean): ImportReport {
  return {
    dryRun, ignoredHeaders,
    summary: { total: rows.length, ready: rows.filter(row => row.status === 'ready').length, invalid: rows.filter(row => row.status === 'invalid').length, duplicates: rows.filter(row => row.status === 'duplicate').length, imported: rows.filter(row => row.status === 'imported').length },
    rows: rows.map(({ row, values, status, issues }) => ({ row, values, status, issues })),
  };
}
