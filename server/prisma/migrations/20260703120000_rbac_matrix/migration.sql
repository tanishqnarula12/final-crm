-- RBAC v2: multi-role users + admin-configurable permission matrix.
--
-- `users.role` (single) becomes `users.roles` (array). We backfill the array
-- from the existing single value BEFORE dropping the column so no role is lost
-- (e.g. the super-admin keeps ADMIN).

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('NONE', 'ASSIGNED', 'ALL');

-- AlterTable: add the array column, backfill from the scalar, then drop it.
ALTER TABLE "users" ADD COLUMN "roles" "Role"[] DEFAULT ARRAY['INTERNAL_USER']::"Role"[];
UPDATE "users" SET "roles" = ARRAY["role"]::"Role"[];
ALTER TABLE "users" DROP COLUMN "role";

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_module_action_key" ON "role_permissions"("role", "module", "action");
