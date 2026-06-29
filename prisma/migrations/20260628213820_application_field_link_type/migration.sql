-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('FACEBOOK', 'LINKEDIN', 'EGD');

-- AlterTable
ALTER TABLE "ApplicationField" ADD COLUMN     "linkType" "LinkType";
