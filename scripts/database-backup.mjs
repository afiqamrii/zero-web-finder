import nextEnv from '@next/env';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Read-only database inspection and public-schema backup. This never restores,
// changes schema, marks migrations applied, or starts an application worker.
const [action, projectRef] = process.argv.slice(2);
if (action === '--help') {
  console.log('Usage: node scripts/database-backup.mjs inspect|backup <expected-supabase-project-ref>');
  console.log('Uses DIRECT_URL privately. Requires PostgreSQL clients in .local/tools/postgresql-18.7/bin or PG_BIN.');
  process.exit(0);
}
if (!['inspect', 'backup'].includes(action) || !/^[a-z0-9]{20}$/.test(projectRef ?? '')) {
  console.error('Choose inspect or backup and provide the expected Supabase project reference.');
  process.exit(1);
}
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
let connection;
try { connection = new URL(process.env.DIRECT_URL); } catch { console.error('DIRECT_URL is missing or invalid.'); process.exit(1); }
const direct = connection.hostname === `db.${projectRef}.supabase.co`;
const session = connection.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(connection.username).endsWith(`.${projectRef}`) && connection.port === '5432';
if ((!direct && !session) || !['postgres:', 'postgresql:'].includes(connection.protocol) || !connection.password || decodeURIComponent(connection.pathname) !== '/postgres' || (connection.searchParams.get('schema') || 'public') !== 'public') {
  console.error('DIRECT_URL must identify the expected project through its direct endpoint or session pooler, with a password.');
  process.exit(1);
}
const binaries = resolve(process.env.PG_BIN || '.local/tools/postgresql-18.7/bin');
const sslmode = connection.searchParams.get('sslmode') || 'require';
if (!['require', 'verify-ca', 'verify-full'].includes(sslmode)) { console.error('Remote backups require TLS. Use sslmode=require or certificate verification.'); process.exit(1); }
const inheritedEnv = { ...process.env };
for (const key of Object.keys(inheritedEnv)) if (/^PG/i.test(key)) delete inheritedEnv[key];
const childEnv = {
  ...inheritedEnv,
  PGHOST: connection.hostname, PGPORT: connection.port || '5432',
  PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)) || 'postgres',
  PGSSLMODE: sslmode, PGCONNECT_TIMEOUT: '15',
  PGOPTIONS: '-c default_transaction_read_only=on', PGCLIENTENCODING: 'UTF8',
};

function run(tool, args, timeoutMs = 60000) {
  return new Promise((accept, reject) => {
    const child = spawn(resolve(binaries, `${tool}.exe`), args, { env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = [];
    let outputBytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${tool} timed out. No schema change was attempted.`)); }, timeoutMs);
    child.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes <= 5_000_000) output.push(chunk); else child.kill(); });
    // Never print PostgreSQL stderr: provider errors can include private connection details.
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error(`${tool} could not start. Check the PostgreSQL client tools.`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && outputBytes <= 5_000_000) accept(Buffer.concat(output).toString('utf8').trim());
      else reject(new Error(`${tool} failed. Check the database connection and permissions; no schema change was attempted.`));
    });
  });
}
const quoteIdentifier = name => '"' + name.replaceAll('"', '""') + '"';
async function query(sql) {
  const raw = await run('psql', ['--no-password', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', `BEGIN TRANSACTION READ ONLY; ${sql} COMMIT;`]);
  return JSON.parse(raw);
}
async function inspect() {
  const snapshot = await query(`SELECT json_build_object(
    'serverVersion', current_setting('server_version'),
    'readOnly', current_setting('transaction_read_only'),
    'tables', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
      SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname
    ) t), '[]'::json),
    'columns', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
      SELECT table_name, column_name, data_type, is_nullable, column_default, datetime_precision FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name, ordinal_position
    ) t), '[]'::json),
    'indexes', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
      SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname
    ) t), '[]'::json)
  );`);
  if (!snapshot.tables.some(table => table.name === 'Lead')) throw new Error('The original Lead table is absent. Stopped without creating a replacement or changing schema.');
  snapshot.counts = {};
  for (const table of snapshot.tables) snapshot.counts[table.name] = await query(`SELECT to_json(count(*)::text) FROM public.${quoteIdentifier(table.name)};`);
  snapshot.migrations = snapshot.tables.some(table => table.name === '_prisma_migrations')
    ? await query(`SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM public."_prisma_migrations" ORDER BY started_at) t;`)
    : null;
  snapshot.baselineColumns = snapshot.columns.filter(column => column.table_name === 'Lead').map(column => column.column_name).sort();
  snapshot.leadProof = await query(`SELECT json_build_object(
    'count', count(*)::text,
    'rowsHash', md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')),
    'idsHash', md5(COALESCE(jsonb_agg(id ORDER BY id)::text, '[]')),
    'notesHash', md5(COALESCE(jsonb_agg(jsonb_build_object('id',id,'notes',notes) ORDER BY id)::text, '[]')))
    FROM (SELECT ${snapshot.baselineColumns.map(quoteIdentifier).join(',')} FROM public."Lead") t;`);
  return snapshot;
}

try {
  const snapshot = await inspect();
  const parent = resolve('.local/backups');
  await mkdir(parent, { recursive: true });
  const directory = resolve(parent, `${projectRef}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`);
  await mkdir(directory);
  await writeFile(resolve(directory, 'inspection.json'), JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ projectRef, action, serverVersion: snapshot.serverVersion, readOnly: snapshot.readOnly, counts: snapshot.counts, migrations: snapshot.migrations, leadProof: snapshot.leadProof, directory }));
  if (action === 'backup') {
    const partial = resolve(directory, 'public.dump.partial');
    await run('pg_dump', ['--no-password', '--format=custom', '--schema=public', '--strict-names', '--lock-wait-timeout=10000', `--file=${partial}`], 600000);
    await run('pg_restore', ['--list', partial]);
    const archive = resolve(directory, 'public.dump');
    await rename(partial, archive);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    const manifest = { projectRef, schema: 'public', bytes: (await stat(archive)).size, sha256: hash.digest('hex'), createdAt: new Date().toISOString(), archiveReadable: true, restoreTested: false };
    await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ...manifest, archive }));
  }
} catch (error) {
  // Only controlled errors are emitted; neither database rows nor credentials are printed.
  console.error(error instanceof SyntaxError ? 'Database inspection returned an unexpected format.' : /^((psql|pg_dump|pg_restore) (failed|could not start|timed out)|The original Lead table)/.test(error.message) ? error.message : 'Database inspection or backup could not complete. Check local tools, connection access, and private backup directory permissions.');
  process.exitCode = 1;
}
