-- A MOM can now be drafted against a Lead BEFORE it's converted to a Client
-- (the new "Create MoM" lead stage), not only against an existing Client.
--
-- Additive only: clientId becomes nullable (existing rows keep their value,
-- untouched) and a new nullable leadId column is added, mirroring how
-- Meeting.leadId/Task.leadId already work (plain column, no FK relation —
-- Lead has none). Exactly one of clientId/leadId is set per row going
-- forward; every existing Mom row keeps clientId set and leadId null.
ALTER TABLE "moms" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "moms" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
CREATE INDEX IF NOT EXISTS "moms_leadId_idx" ON "moms"("leadId");
