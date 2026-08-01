-- Leave types: Full Day (default, unchanged behavior) | Half Day | Early Leave
-- | Late Entry, each with their own extra detail (which half, or what time).
-- AlterTable
ALTER TABLE "leaves" ADD COLUMN "leaveType" TEXT NOT NULL DEFAULT 'Full Day';
ALTER TABLE "leaves" ADD COLUMN "halfDaySlot" TEXT;
ALTER TABLE "leaves" ADD COLUMN "timeValue" TEXT;
