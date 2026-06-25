-- CreateEnum
CREATE TYPE "AgendaItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: nowa kolumna zakończenia spotkania.
ALTER TABLE "Meeting" ADD COLUMN "endedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AgendaItemStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_idx" ON "AgendaItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAttendance_meetingId_idx" ON "MeetingAttendance"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendance_meetingId_memberId_key" ON "MeetingAttendance"("meetingId", "memberId");

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migracja danych: dotychczasowy porządek obrad (tekst, jeden punkt w wierszu)
-- przenosimy do osobnych wierszy AgendaItem, zachowując kolejność.
INSERT INTO "AgendaItem" ("id", "meetingId", "order", "title", "status", "createdAt")
SELECT
    gen_random_uuid()::text,
    m."id",
    t.ord - 1,
    btrim(t.line),
    'PENDING'::"AgendaItemStatus",
    CURRENT_TIMESTAMP
FROM "Meeting" m,
     LATERAL regexp_split_to_table(m."agenda", E'\n') WITH ORDINALITY AS t(line, ord)
WHERE m."agenda" IS NOT NULL AND btrim(t.line) <> '';

-- Po przeniesieniu danych usuwamy starą kolumnę.
ALTER TABLE "Meeting" DROP COLUMN "agenda";
