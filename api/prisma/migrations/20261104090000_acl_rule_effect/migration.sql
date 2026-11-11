-- CreateEnum
CREATE TYPE "AclEffect" AS ENUM ('ALLOW', 'DENY');

-- AlterTable
ALTER TABLE "AclRule" ADD COLUMN "effect" "AclEffect" NOT NULL DEFAULT 'ALLOW';
