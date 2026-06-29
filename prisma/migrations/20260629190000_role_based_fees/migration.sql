-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_paymentTierId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentTier" DROP CONSTRAINT "PaymentTier_organizationId_fkey";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "paymentTierId";

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "feeExempt",
ADD COLUMN     "feeAmount" INTEGER;

-- DropTable
DROP TABLE "PaymentTier";

