-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pan" TEXT NOT NULL,
    "age" INTEGER NOT NULL DEFAULT 0,
    "assumptions" TEXT NOT NULL DEFAULT '',
    "assetAllocation" JSONB,
    "clientDetails" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetMonth" INTEGER NOT NULL DEFAULT 0,
    "targetYear" INTEGER NOT NULL DEFAULT 0,
    "createdMonth" INTEGER NOT NULL DEFAULT 0,
    "createdYear" INTEGER NOT NULL DEFAULT 0,
    "inflation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sipIncRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentInv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentSip" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kidName" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "actuals" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moms" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "meetingNumber" TEXT NOT NULL DEFAULT '',
    "meetingDate" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "stage" TEXT,
    "groupLeaderId" TEXT,
    "assignedTo" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "stage" TEXT,
    "status" TEXT,
    "ownerId" TEXT,
    "mobile" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "groupLeaderId" TEXT,
    "leadId" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "groupLeaderId" TEXT,
    "proposalCategory" TEXT,
    "stage" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "goals_clientId_idx" ON "goals"("clientId");

-- CreateIndex
CREATE INDEX "moms_clientId_idx" ON "moms"("clientId");

-- CreateIndex
CREATE INDEX "tasks_leadId_idx" ON "tasks"("leadId");

-- CreateIndex
CREATE INDEX "tasks_stage_idx" ON "tasks"("stage");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_mobile_idx" ON "leads"("mobile");

-- CreateIndex
CREATE INDEX "meetings_clientId_idx" ON "meetings"("clientId");

-- CreateIndex
CREATE INDEX "meetings_leadId_idx" ON "meetings"("leadId");

-- CreateIndex
CREATE INDEX "prospects_groupLeaderId_idx" ON "prospects"("groupLeaderId");

-- CreateIndex
CREATE INDEX "prospects_proposalCategory_idx" ON "prospects"("proposalCategory");

-- CreateIndex
CREATE UNIQUE INDEX "advisor_profiles_userId_key" ON "advisor_profiles"("userId");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moms" ADD CONSTRAINT "moms_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisor_profiles" ADD CONSTRAINT "advisor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
