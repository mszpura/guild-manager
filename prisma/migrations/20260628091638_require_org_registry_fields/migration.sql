/*
  Warnings:

  - Made the column `krs` on table `Organization` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nip` on table `Organization` required. This step will fail if there are existing NULL values in that column.
  - Made the column `city` on table `Organization` required. This step will fail if there are existing NULL values in that column.
  - Made the column `foundedYear` on table `Organization` required. This step will fail if there are existing NULL values in that column.
  - Made the column `postalCode` on table `Organization` required. This step will fail if there are existing NULL values in that column.
  - Made the column `regon` on table `Organization` required. This step will fail if there are existing NULL values in that column.
  - Made the column `street` on table `Organization` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Member_paymentTierId_idx";

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "krs" SET NOT NULL,
ALTER COLUMN "nip" SET NOT NULL,
ALTER COLUMN "city" SET NOT NULL,
ALTER COLUMN "foundedYear" SET NOT NULL,
ALTER COLUMN "postalCode" SET NOT NULL,
ALTER COLUMN "regon" SET NOT NULL,
ALTER COLUMN "street" SET NOT NULL;
