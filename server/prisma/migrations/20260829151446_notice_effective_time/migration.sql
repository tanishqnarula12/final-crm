-- AlterTable: a nullable column with no default — safe on existing rows
-- (they get NULL, meaning "no specific time," which is exactly their
-- current behavior: visible from the start of effectiveDate).
ALTER TABLE "notices" ADD COLUMN "effectiveTime" TEXT;
