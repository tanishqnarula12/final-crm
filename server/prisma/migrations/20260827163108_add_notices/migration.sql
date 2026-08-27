-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdBy" TEXT,
    "dedupeKey" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notices_dedupeKey_key" ON "notices"("dedupeKey");

-- CreateIndex
CREATE INDEX "notices_deletedAt_createdAt_idx" ON "notices"("deletedAt", "createdAt");
