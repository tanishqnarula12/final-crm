-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "responseMessage" TEXT,
    "respondedBy" TEXT,
    "respondedAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaves_createdBy_idx" ON "leaves"("createdBy");

-- CreateIndex
CREATE INDEX "leaves_status_idx" ON "leaves"("status");
