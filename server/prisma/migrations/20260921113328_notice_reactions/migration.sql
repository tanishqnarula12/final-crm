-- AlterTable
ALTER TABLE "notices" ADD COLUMN     "reactions" JSONB NOT NULL DEFAULT '{}';
