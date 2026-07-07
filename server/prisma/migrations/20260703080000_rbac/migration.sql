-- RBAC: replace the 3-role enum with 7 roles, add ownership/audit columns to
-- every module table, and add the global activity_logs table.
--
-- The enum swap remaps existing rows: ADMIN stays ADMIN; every other legacy
-- value (MANAGER/VIEWER) becomes INTERNAL_USER (least privilege). Roles are
-- then re-assigned from the in-app User Management screen.

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'RM', 'PORTFOLIO_MANAGER', 'INSURANCE_MANAGER', 'SERVICE_MANAGER', 'OPERATIONS_MANAGER', 'INTERNAL_USER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE
    WHEN "role"::text = 'ADMIN' THEN 'ADMIN'
    ELSE 'INTERNAL_USER'
  END::"Role_new"
);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'INTERNAL_USER';
COMMIT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT;

-- AlterTable
ALTER TABLE "moms" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "departmentOwner" TEXT;

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "performedBy" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_moduleName_recordId_idx" ON "activity_logs"("moduleName", "recordId");

-- CreateIndex
CREATE INDEX "activity_logs_performedBy_idx" ON "activity_logs"("performedBy");
