-- AlterTable
ALTER TABLE "AgendaItem" ADD COLUMN     "resolutionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgendaItem_resolutionId_key" ON "AgendaItem"("resolutionId");

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
