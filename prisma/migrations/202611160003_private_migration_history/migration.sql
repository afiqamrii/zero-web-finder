-- Prisma creates this table before applying migrations. Supabase's default
-- privileges can otherwise expose migration logs through the Data API.
-- Ownership and service-role privileges remain unchanged; the migration owner
-- can still read/write its history because RLS is not forced on the owner.
DO $$
DECLARE role_name text;
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."_prisma_migrations" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
