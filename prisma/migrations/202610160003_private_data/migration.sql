-- This is a single-owner server application. Only the Prisma server role should
-- access these records. No public REST or browser role is granted a policy.
DO $$
DECLARE tab text; role_name text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['Lead','Campaign','Enrollment','EmailMessage','Suppression','DiscoveryJob','Activity','WebhookEvent','Workspace'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', tab);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tab, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Backfill prioritization without treating scraped addresses as verified.
UPDATE "Lead" SET score = LEAST(100,
  CASE WHEN "leadType" = 'NO_WEBSITE' THEN 30 ELSE 20 END +
  CASE WHEN email IS NOT NULL AND email <> '' THEN 10 ELSE 0 END +
  CASE WHEN phone IS NOT NULL AND phone <> '' THEN 10 ELSE 0 END +
  CASE WHEN rating >= 4 THEN 15 ELSE 0 END +
  CASE WHEN "reviewCount" >= 20 THEN 15 ELSE 0 END
);
