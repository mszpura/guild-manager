-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('GENERAL_ASSEMBLY', 'BOARD_MEETING');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MeetingType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "agenda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRole" (
    "meetingId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MeetingRole_pkey" PRIMARY KEY ("meetingId","roleId")
);

-- CreateIndex
CREATE INDEX "Meeting_organizationId_startsAt_idx" ON "Meeting"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "MeetingRole_roleId_idx" ON "MeetingRole"("roleId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRole" ADD CONSTRAINT "MeetingRole_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRole" ADD CONSTRAINT "MeetingRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
