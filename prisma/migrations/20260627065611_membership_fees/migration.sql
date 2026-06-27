-- CreateTable
CREATE TABLE "MembershipFee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" INTEGER,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipFee_organizationId_year_idx" ON "MembershipFee"("organizationId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipFee_memberId_year_key" ON "MembershipFee"("memberId", "year");

-- AddForeignKey
ALTER TABLE "MembershipFee" ADD CONSTRAINT "MembershipFee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFee" ADD CONSTRAINT "MembershipFee_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
