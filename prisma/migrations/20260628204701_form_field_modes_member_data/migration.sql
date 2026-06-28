-- CreateEnum
CREATE TYPE "FormFieldMode" AS ENUM ('HIDDEN', 'OPTIONAL', 'REQUIRED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "address" TEXT,
ADD COLUMN     "customData" JSONB,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "birthDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "formAddress" "FormFieldMode" NOT NULL DEFAULT 'HIDDEN',
ADD COLUMN     "formBirthDate" "FormFieldMode" NOT NULL DEFAULT 'REQUIRED',
ADD COLUMN     "formPhone" "FormFieldMode" NOT NULL DEFAULT 'HIDDEN';
