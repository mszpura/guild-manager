-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "address",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "regon" TEXT,
ADD COLUMN     "street" TEXT;

