-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('DRAFT', 'VOTING', 'PASSED', 'REJECTED');

-- CreateTable
CREATE TABLE "Resolution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "status" "ResolutionStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionVote" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resolution_organizationId_idx" ON "Resolution"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Resolution_organizationId_number_key" ON "Resolution"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ResolutionVote_resolutionId_idx" ON "ResolutionVote"("resolutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionVote_resolutionId_memberId_key" ON "ResolutionVote"("resolutionId", "memberId");

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionVote" ADD CONSTRAINT "ResolutionVote_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionVote" ADD CONSTRAINT "ResolutionVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
