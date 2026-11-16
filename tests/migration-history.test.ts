import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile('prisma/migrations/202611160003_private_migration_history/migration.sql', 'utf8');
describe('private Prisma migration history', () => {
  it('does not create history in databases initialized directly from migration SQL', async () => {
    const db = new PGlite();
    try {
      await db.exec(migration);
      expect((await db.query(`SELECT to_regclass('public."_prisma_migrations"') AS history;`)).rows).toEqual([{ history: null }]);
    } finally { await db.close(); }
  });

  it('revokes public API access while preserving existing history and owner writes, including replay', async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY, logs text);
        INSERT INTO "_prisma_migrations" VALUES ('existing','original migration log');
        GRANT ALL ON TABLE "_prisma_migrations" TO PUBLIC,anon,authenticated;`);
      await db.exec(migration);
      await db.exec(migration);
      await db.exec(`INSERT INTO "_prisma_migrations" VALUES ('new','new migration log'); UPDATE "_prisma_migrations" SET logs='owner updated log' WHERE id='new';`);
      expect((await db.query(`SELECT * FROM "_prisma_migrations" ORDER BY id;`)).rows).toEqual([{ id: 'existing', logs: 'original migration log' }, { id: 'new', logs: 'owner updated log' }]);
      expect((await db.query(`SELECT c.relrowsecurity AS rls,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access,
        EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access
        FROM pg_class c WHERE c.oid='public."_prisma_migrations"'::regclass;`)).rows).toEqual([{ rls: true, anon_access: false, authenticated_access: false, public_access: false }]);
    } finally { await db.close(); }
  });
});
