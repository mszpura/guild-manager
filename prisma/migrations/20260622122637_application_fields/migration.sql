-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('STRING');

-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN     "customData" JSONB;

-- CreateTable
CREATE TABLE "ApplicationField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'STRING',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationField_organizationId_idx" ON "ApplicationField"("organizationId");

-- AddForeignKey
ALTER TABLE "ApplicationField" ADD CONSTRAINT "ApplicationField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

