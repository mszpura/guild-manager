-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Meeting_createdById_idx" ON "Meeting"("createdById");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
