-- CreateTable
CREATE TABLE "managed_portfolio_overrides" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "aumAmount" DOUBLE PRECISION,
    "aumAsOfDate" TEXT,
    "aumUpdatedBy" TEXT,
    "aumUpdatedAt" TIMESTAMP(3),
    "sipAmount" DOUBLE PRECISION,
    "sipUpdatedBy" TEXT,
    "sipUpdatedAt" TIMESTAMP(3),
    "insuranceAmount" DOUBLE PRECISION,
    "insuranceUpdatedBy" TEXT,
    "insuranceUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "managed_portfolio_overrides_pkey" PRIMARY KEY ("id")
);
