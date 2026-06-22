-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID');

-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN     "paymentAmount" INTEGER,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "paymentTierLabel" TEXT,
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "stripeSessionId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "membershipPaid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PaymentTier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentTier_organizationId_idx" ON "PaymentTier"("organizationId");

-- AddForeignKey
ALTER TABLE "PaymentTier" ADD CONSTRAINT "PaymentTier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

