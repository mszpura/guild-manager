-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('FOR', 'AGAINST', 'ABSTAIN');

-- CreateTable
CREATE TABLE "AgendaComment" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaVote" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgendaComment_agendaItemId_idx" ON "AgendaComment"("agendaItemId");

-- CreateIndex
CREATE INDEX "AgendaComment_authorId_idx" ON "AgendaComment"("authorId");

-- CreateIndex
CREATE INDEX "AgendaVote_agendaItemId_idx" ON "AgendaVote"("agendaItemId");

-- CreateIndex
CREATE INDEX "AgendaVote_memberId_idx" ON "AgendaVote"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaVote_agendaItemId_memberId_key" ON "AgendaVote"("agendaItemId", "memberId");

-- AddForeignKey
ALTER TABLE "AgendaComment" ADD CONSTRAINT "AgendaComment_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaComment" ADD CONSTRAINT "AgendaComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaVote" ADD CONSTRAINT "AgendaVote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaVote" ADD CONSTRAINT "AgendaVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
