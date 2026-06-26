-- CreateEnum
CREATE TYPE "SignatureRole" AS ENUM ('CHAIRPERSON', 'SECRETARY');

-- CreateTable
CREATE TABLE "ResolutionSignature" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResolutionSignature_resolutionId_idx" ON "ResolutionSignature"("resolutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionSignature_resolutionId_memberId_key" ON "ResolutionSignature"("resolutionId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionSignature_resolutionId_role_key" ON "ResolutionSignature"("resolutionId", "role");

-- AddForeignKey
ALTER TABLE "ResolutionSignature" ADD CONSTRAINT "ResolutionSignature_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionSignature" ADD CONSTRAINT "ResolutionSignature_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
