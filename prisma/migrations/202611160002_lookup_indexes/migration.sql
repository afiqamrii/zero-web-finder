-- Read-path indexes for bounded opportunity refresh and canonical mailbox lookups.
-- Non-unique indexes preserve all existing rows, including legacy duplicates.
CREATE INDEX "Lead_updatedAt_id_idx" ON "Lead"("updatedAt" DESC, "id" ASC);
CREATE INDEX "Lead_email_normalized_idx" ON "Lead"((lower(btrim("email"))));
CREATE INDEX "Suppression_email_normalized_idx" ON "Suppression"((lower(btrim("email"))));
CREATE INDEX "Enrollment_email_normalized_idx" ON "Enrollment"((lower(btrim("email"))));
