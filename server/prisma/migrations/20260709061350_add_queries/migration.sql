-- CreateTable
CREATE TABLE "queries" (
    "id" TEXT NOT NULL,
    "stage" TEXT,
    "category" TEXT,
    "assignedTo" TEXT,
    "createdBy" TEXT,
    "departmentOwner" TEXT,
    "deletedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queries_stage_idx" ON "queries"("stage");
