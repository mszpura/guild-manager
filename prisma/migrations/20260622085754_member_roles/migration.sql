-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'MEMBER',
ALTER COLUMN "lastName" DROP NOT NULL,
ALTER COLUMN "birthDate" DROP NOT NULL;

-- DropTable
DROP TABLE "Membership";

