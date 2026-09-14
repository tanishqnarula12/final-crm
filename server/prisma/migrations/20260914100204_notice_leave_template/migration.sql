-- AlterTable
ALTER TABLE "notices" ADD COLUMN     "templateData" JSONB,
ADD COLUMN     "templateKind" TEXT;
