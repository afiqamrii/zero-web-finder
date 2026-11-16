-- Add personal sales tasks without modifying existing leads or outreach history.
CREATE TABLE "SalesTask" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesTask_status_check" CHECK ("status" IN ('OPEN', 'DONE')),
  CONSTRAINT "SalesTask_completion_check" CHECK (
    ("status" = 'OPEN' AND "completedAt" IS NULL) OR
    ("status" = 'DONE' AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "SalesTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SalesTask_status_dueAt_id_idx" ON "SalesTask"("status", "dueAt", "id");
CREATE INDEX "SalesTask_leadId_status_dueAt_idx" ON "SalesTask"("leadId", "status", "dueAt");

-- Match the private, single-owner server access model of the existing tables.
ALTER TABLE "SalesTask" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SalesTask" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "SalesTask" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
