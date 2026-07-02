-- CreateTable
CREATE TABLE "MeetingSignature" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSignature_meetingId_idx" ON "MeetingSignature"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSignature_meetingId_memberId_key" ON "MeetingSignature"("meetingId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSignature_meetingId_role_key" ON "MeetingSignature"("meetingId", "role");

-- AddForeignKey
ALTER TABLE "MeetingSignature" ADD CONSTRAINT "MeetingSignature_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSignature" ADD CONSTRAINT "MeetingSignature_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
