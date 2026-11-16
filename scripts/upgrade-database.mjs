import nextEnv from '@next/env';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// Explicit, one-time upgrade of a backed-up original Lead-only database.
// Ordinary deployment never invokes this script. A completed offline rehearsal,
// matching live schema/data, and an explicit apply flag are mandatory.
const [flag, backupPath, expectedRef] = process.argv.slice(2);
if (flag !== '--apply-reviewed-baseline' || !backupPath || !/^[a-z0-9]{20}$/.test(expectedRef ?? '')) {
  console.error('Usage: node scripts/upgrade-database.mjs --apply-reviewed-baseline <rehearsed-backup-directory> <expected-project-ref>');
  process.exit(1);
}
const directory = resolve(backupPath);
if (!directory.startsWith(resolve('.local/backups') + sep)) { console.error('The rehearsed backup must be inside .local/backups.'); process.exit(1); }
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
let connection;
try { connection = new URL(process.env.DIRECT_URL); } catch { console.error('DIRECT_URL is missing or invalid.'); process.exit(1); }
const direct = connection.hostname === `db.${expectedRef}.supabase.co`;
const session = connection.hostname.endsWith('.pooler.supabase.com') && connection.port === '5432' && decodeURIComponent(connection.username).endsWith(`.${expectedRef}`);
if ((!direct && !session) || !connection.password || !['postgres:', 'postgresql:'].includes(connection.protocol) || decodeURIComponent(connection.pathname) !== '/postgres' || (connection.searchParams.get('schema') || 'public') !== 'public') { console.error('DIRECT_URL does not match the expected original project, database, schema and connection mode.'); process.exit(1); }
const sslmode = connection.searchParams.get('sslmode') || 'require';
if (!['require', 'verify-ca', 'verify-full'].includes(sslmode)) { console.error('Remote database access requires TLS.'); process.exit(1); }
const inheritedEnv = { ...process.env };
for (const key of Object.keys(inheritedEnv)) if (/^PG/i.test(key)) delete inheritedEnv[key];
const pgEnv = { ...inheritedEnv, PGHOST: connection.hostname, PGPORT: connection.port || '5432', PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password), PGDATABASE: decodeURIComponent(connection.pathname.slice(1)) || 'postgres', PGSSLMODE: sslmode, PGCONNECT_TIMEOUT: '15', PGCLIENTENCODING: 'UTF8' };
const psql = resolve(process.env.PG_BIN || '.local/tools/postgresql-18.7/bin', 'psql.exe');
function run(binary, args, env, timeoutMs = 60000) {
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = [];
    let bytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Command timed out')); }, timeoutMs);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes <= 5_000_000) output.push(chunk); else child.kill(); });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Command could not start')); });
    child.on('close', code => { clearTimeout(timer); if (code === 0 && bytes <= 5_000_000) accept(Buffer.concat(output).toString('utf8').trim()); else reject(new Error('Command failed')); });
  });
}
async function query(sql) {
  return JSON.parse(await run(psql, ['--no-password', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', `BEGIN TRANSACTION READ ONLY; ${sql} COMMIT;`], pgEnv));
}
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const fingerprintSql = columns => `SELECT json_build_object(
  'count',count(*)::text,
  'rowsHash',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')),
  'idsHash',md5(COALESCE(jsonb_agg(id ORDER BY id)::text,'[]')),
  'notesHash',md5(COALESCE(jsonb_agg(jsonb_build_object('id',id,'notes',notes) ORDER BY id)::text,'[]')))
  FROM (SELECT ${columns.map(quote).join(',')} FROM public."Lead") t;`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let phase = 'validating the rehearsed backup';
const progress = { projectRef: expectedRef, productionBaselineRecorded: false, productionMigrationsDeployed: false, productionVerified: false };
try {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const inspection = JSON.parse(await readFile(resolve(directory, 'inspection.json'), 'utf8'));
  const rehearsal = JSON.parse(await readFile(resolve(directory, 'rehearsal.json'), 'utf8'));
  const digest = createHash('sha256').update(await readFile(resolve(directory, 'public.dump'))).digest('hex');
  if (manifest.projectRef !== expectedRef || !manifest.restoreTested || digest !== manifest.sha256 || rehearsal.archiveSha256 !== digest || !rehearsal.originalRowsPreserved || !rehearsal.baselineSchemaMatches || !same(inspection.leadProof, rehearsal.originalLeadProof) || Date.now() - Date.parse(manifest.createdAt) > 30 * 60 * 1000) throw new Error('Backup or rehearsal validation failed');
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
  if (migrations[0] !== '202610160001_baseline' || !same(migrations.slice(1), rehearsal.migrationsAppliedLocally)) throw new Error('Migration sequence changed after rehearsal');
  const checksums = Object.fromEntries(await Promise.all(migrations.map(async name => [name, createHash('sha256').update(await readFile(`prisma/migrations/${name}/migration.sql`)).digest('hex')])));
  if (!same(checksums, rehearsal.migrationChecksums)) throw new Error('Migration contents changed after rehearsal');

  phase = 'checking the live original schema and rows';
  const tables = await query("SELECT COALESCE(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public';");
  if (!same(tables, ['Lead'])) throw new Error('Live tables or migration history changed');
  const columns = await query(`SELECT json_agg(row_to_json(t)) FROM (
    SELECT table_name,column_name,data_type,is_nullable,column_default,datetime_precision FROM information_schema.columns
    WHERE table_schema='public' ORDER BY table_name,ordinal_position) t;`);
  const indexes = await query(`SELECT json_agg(row_to_json(t)) FROM (
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname) t;`);
  if (!same(columns, inspection.columns) || !same(indexes, inspection.indexes)) throw new Error('Live schema changed after backup');
  const before = await query(fingerprintSql(inspection.baselineColumns));
  if (!same(before, inspection.leadProof)) throw new Error('Live lead data changed after backup');

  phase = 'recording the proven original baseline';
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', '202610160001_baseline', '--schema', 'prisma/schema.prisma'], inheritedEnv, 120000);
  progress.productionBaselineRecorded = true;
  await writeFile(resolve(directory, 'production-progress.json'), JSON.stringify({ ...progress, phase, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  phase = 'deploying the reviewed additive migrations';
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], inheritedEnv, 180000);
  progress.productionMigrationsDeployed = true;

  phase = 'verifying production preservation and private access';
  const after = await query(fingerprintSql(inspection.baselineColumns));
  if (!same(before, after)) throw new Error('Original lead fields changed');
  const history = await query(`SELECT json_agg(row_to_json(t)) FROM (SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM public."_prisma_migrations" ORDER BY migration_name) t;`);
  if (!same(history.map(item => item.migration_name), migrations) || history.some(item => !item.finished || item.rolled_back || item.checksum !== checksums[item.migration_name])) throw new Error('Migration history verification failed');
  const access = await query(`SELECT json_agg(row_to_json(t)) FROM (SELECT c.relname AS name,c.relrowsecurity AS rls,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname) t;`);
  if (access.length !== 11 || access.some(table => !table.rls || table.anon_access || table.authenticated_access || table.public_access)) throw new Error('Private table access verification failed');
  const state = await query(`SELECT json_build_object(
    'campaigns',(SELECT count(*) FROM "Campaign"),'discoveryJobs',(SELECT count(*) FROM "DiscoveryJob"),
    'emailMessages',(SELECT count(*) FROM "EmailMessage"),'salesTasks',(SELECT count(*) FROM "SalesTask"),
    'verifiedLeads',(SELECT count(*) FROM "Lead" WHERE "emailVerified"),
    'sendingEnabled',(SELECT count(*) FROM "Workspace" WHERE "sendingEnabled" OR "followUpsEnabled"),
    'sendingDefaults',(SELECT json_object_agg(column_name,column_default) FROM information_schema.columns WHERE table_schema='public' AND table_name='Workspace' AND column_name IN ('sendingEnabled','followUpsEnabled')));`);
  if (state.campaigns || state.discoveryJobs || state.emailMessages || state.salesTasks || state.verifiedLeads || state.sendingEnabled || Object.values(state.sendingDefaults).some(value => value !== 'false')) throw new Error('Initial automation state verification failed');
  progress.productionVerified = true;
  const report = { ...progress, originalLeadProof: before, upgradedLeadProof: after, originalRowsPreserved: true, migrationHistory: history, privateTableAccess: access.filter(table => table.name !== '_prisma_migrations'), migrationHistoryAccess: access.find(table => table.name === '_prisma_migrations'), automationState: state, backupSha256: digest, verifiedAt: new Date().toISOString() };
  await writeFile(resolve(directory, 'production-upgrade.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(resolve(directory, 'production-progress.json'), JSON.stringify({ ...progress, phase: 'verified', at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...progress, originalLeadCount: before.count, originalRowsPreserved: true, rowsHash: after.rowsHash, idsHash: after.idsHash, notesHash: after.notesHash, successfulMigrations: history.length, privateTablesVerified: access.length, automationState: state, report: resolve(directory, 'production-upgrade.json') }));
} catch {
  await writeFile(resolve(directory, 'production-progress.json'), JSON.stringify({ ...progress, phase, at: new Date().toISOString() }, null, 2), { mode: 0o600 }).catch(() => {});
  console.error(`Stopped while ${phase}. Baseline recorded: ${progress.productionBaselineRecorded}; migrations deployed: ${progress.productionMigrationsDeployed}. No reset, rollback, lead verification, or automatic retry was attempted. Check the private production-progress.json report.`);
  process.exitCode = 1;
}
