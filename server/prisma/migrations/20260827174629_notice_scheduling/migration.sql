-- DropIndex
DROP INDEX "notices_deletedAt_createdAt_idx";

-- AlterTable: add columns nullable/loosely-defaulted first, so this is safe
-- against existing rows (birthday/leave/general notices already posted).
ALTER TABLE "notices" ADD COLUMN     "effectiveDate" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "triggered" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: every existing notice was already live and already broadcast —
-- effectiveDate = the date it was created, triggered stays true (the DEFAULT
-- true above already covers this, listed for clarity).
UPDATE "notices" SET "effectiveDate" = to_char("createdAt", 'YYYY-MM-DD') WHERE "effectiveDate" IS NULL;

-- Now that every row has a value, make it required and flip the default for
-- FUTURE inserts to false — a newly created notice must earn triggered=true
-- via the create route (same day) or the scheduler (a later day).
ALTER TABLE "notices" ALTER COLUMN "effectiveDate" SET NOT NULL;
ALTER TABLE "notices" ALTER COLUMN "triggered" SET DEFAULT false;

-- CreateIndex
CREATE INDEX "notices_deletedAt_effectiveDate_createdAt_idx" ON "notices"("deletedAt", "effectiveDate", "createdAt");
