-- "Delete chat" (delete-for-me): a per-member timestamp that removes a
-- conversation from THIS member's list. A message newer than hiddenAt un-hides
-- it (WhatsApp-style), so the other side's history is never touched.
-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN "hiddenAt" TIMESTAMP(3);
