-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: spotkania, których miejsce wygląda jak adres URL, traktujemy jako online.
UPDATE "Meeting" SET "isOnline" = true WHERE "location" ~* '^https?://';
