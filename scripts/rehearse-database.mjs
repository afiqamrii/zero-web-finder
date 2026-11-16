import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// Offline only: pg_restore emits SQL to a file, and every SQL statement executes
// inside an in-memory PGlite instance. This script does not load connection URLs.
const directory = resolve(process.argv[2] || '.local/backups');
const backupRoot = resolve('.local/backups') + sep;
if (!directory.startsWith(backupRoot)) { console.error('Choose an existing backup directory inside .local/backups.'); process.exit(1); }
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const schemaSql = `SELECT column_name, data_type, is_nullable, column_default, datetime_precision
  FROM information_schema.columns WHERE table_schema='public' AND table_name='Lead' ORDER BY column_name;`;
const indexSql = `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='Lead' ORDER BY indexname;`;
const constraintSql = `SELECT conname,contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public."Lead"'::regclass ORDER BY conname;`;
const fingerprintSql = columns => `SELECT json_build_object(
  'count',count(*)::text,
  'rowsHash',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')),
  'idsHash',md5(COALESCE(jsonb_agg(id ORDER BY id)::text,'[]')),
  'notesHash',md5(COALESCE(jsonb_agg(jsonb_build_object('id',id,'notes',notes) ORDER BY id)::text,'[]'))
  ) AS proof FROM (SELECT ${columns.map(quote).join(',')} FROM public."Lead") t;`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stripPsql = sql => sql.replace(/^\\(?:unrestrict|restrict) \S+\r?$/gm, '');
let db;
let phase = 'reading private backup';
try {
  const inspection = JSON.parse(await readFile(resolve(directory, 'inspection.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const archive = resolve(directory, 'public.dump');
  const archiveHash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) archiveHash.update(chunk);
  if (archiveHash.digest('hex') !== manifest.sha256) throw new Error('Archive checksum mismatch');

  phase = 'exporting archive to private SQL';
  const sqlPath = resolve(directory, 'restore.sql');
  const restored = spawnSync(resolve(process.env.PG_BIN || '.local/tools/postgresql-18.7/bin', 'pg_restore.exe'), ['--no-owner', '--no-privileges', '--no-comments', '--no-publications', '--no-subscriptions', '--no-security-labels', `--file=${sqlPath}`, archive], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (restored.error || restored.status !== 0) throw new Error('Archive SQL export failed');
  const sql = await readFile(sqlPath, 'utf8');

  phase = 'building baseline reference in memory';
  db = new PGlite();
  await db.waitReady;
  await db.exec(await readFile('prisma/migrations/202610160001_baseline/migration.sql', 'utf8'));
  const baseline = { columns: (await db.query(schemaSql)).rows, indexes: (await db.query(indexSql)).rows, constraints: (await db.query(constraintSql)).rows };
  await db.close();

  phase = 'restoring the archive in memory';
  db = new PGlite();
  await db.waitReady;
  if (/^CREATE SCHEMA public;/m.test(sql)) await db.exec('DROP SCHEMA public;');
  let position = 0;
  const copies = [...sql.matchAll(/^COPY (.+) FROM stdin;\r?\n([\s\S]*?)^\\\.\r?\n/gm)];
  for (const match of copies) {
    await db.exec(stripPsql(sql.slice(position, match.index)));
    await db.query(`COPY ${match[1]} FROM '/dev/blob';`, [], { blob: new Blob([match[2]]) });
    position = match.index + match[0].length;
  }
  await db.exec(stripPsql(sql.slice(position)));
  await db.exec('SET search_path TO public;');
  const restoredSchema = { columns: (await db.query(schemaSql)).rows, indexes: (await db.query(indexSql)).rows, constraints: (await db.query(constraintSql)).rows };
  if (!same(baseline, restoredSchema)) throw new Error('Baseline schema mismatch');
  const before = (await db.query(fingerprintSql(inspection.baselineColumns))).rows[0].proof;
  if (!same(before, inspection.leadProof)) throw new Error('Restored original rows differ from inspected database');

  phase = 'rehearsing additive migrations locally';
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY, migration_name text NOT NULL);
    GRANT ALL ON TABLE "Lead", "_prisma_migrations" TO PUBLIC, anon, authenticated;`);
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true })).filter(item => item.isDirectory() && item.name !== '202610160001_baseline').map(item => item.name).sort();
  const migrationChecksums = Object.fromEntries(await Promise.all(['202610160001_baseline', ...migrations].map(async name => [name, createHash('sha256').update(await readFile(`prisma/migrations/${name}/migration.sql`)).digest('hex')])));
  for (const migration of migrations) await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  const after = (await db.query(fingerprintSql(inspection.baselineColumns))).rows[0].proof;
  if (!same(before, after)) throw new Error('Original lead fields changed during local upgrade');
  const access = (await db.query(`SELECT c.relname AS name,c.relrowsecurity AS rls,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access,
    EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;`)).rows;
  if (access.length !== 11 || access.some(table => !table.rls || table.anon_access || table.authenticated_access || table.public_access)) throw new Error('Private access checks failed');
  await db.exec(`INSERT INTO "_prisma_migrations" (id,migration_name) VALUES ('owner-check','private-history-check'); UPDATE "_prisma_migrations" SET migration_name='owner-access-preserved' WHERE id='owner-check';`);
  if ((await db.query(`SELECT migration_name FROM "_prisma_migrations" WHERE id='owner-check';`)).rows[0].migration_name !== 'owner-access-preserved') throw new Error('Migration owner access was not preserved');
  const taskConstraints = (await db.query(`SELECT conname,contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public."SalesTask"'::regclass ORDER BY conname;`)).rows;
  if (taskConstraints.length !== 4 || !taskConstraints.some(item => item.definition.includes('ON DELETE RESTRICT'))) throw new Error('Sales task constraints are incomplete');
  const unverified = (await db.query('SELECT count(*)::text AS count FROM "Lead" WHERE "emailVerified"=false;')).rows[0].count;
  if (unverified !== before.count) throw new Error('Legacy email verification changed');
  const report = { projectRef: manifest.projectRef, archiveSha256: manifest.sha256, restoreTested: true, baselineSchemaMatches: true, originalLeadProof: before, upgradedLeadProof: after, originalRowsPreserved: true, legacyEmailsRemainUnverified: true, migrationsAppliedLocally: migrations, migrationChecksums, privateTableAccess: access.filter(table => table.name !== '_prisma_migrations'), migrationHistoryAccess: access.find(table => table.name === '_prisma_migrations'), migrationOwnerAccessPreserved: true, taskConstraints, checkedAt: new Date().toISOString() };
  await writeFile(resolve(directory, 'rehearsal.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({ ...manifest, restoreTested: true, rehearsalReport: 'rehearsal.json' }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ projectRef: report.projectRef, originalLeadCount: before.count, rowsHash: before.rowsHash, idsHash: before.idsHash, notesHash: before.notesHash, restoreTested: true, baselineSchemaMatches: true, originalRowsPreserved: true, legacyEmailsRemainUnverified: true, migrationsAppliedLocally: migrations, privateTablesVerified: access.length, salesTaskConstraintsVerified: taskConstraints.length, directory }));
} catch {
  console.error(`Offline rehearsal failed while ${phase}. No live database connection was used and no production migration was applied.`);
  process.exitCode = 1;
} finally { await db?.close().catch(() => {}); }
