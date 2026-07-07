-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "poll" JSONB,
ADD COLUMN     "reactions" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "description" TEXT,
ADD COLUMN     "metaUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "metaUpdatedBy" TEXT,
ADD COLUMN     "photo" TEXT;
