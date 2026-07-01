-- AlterTable
ALTER TABLE "Resolution" ADD COLUMN     "resolutionTypeId" TEXT;

-- CreateTable
CREATE TABLE "ResolutionType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "voteThreshold" INTEGER NOT NULL DEFAULT 50,
    "requiresMeeting" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResolutionType_organizationId_idx" ON "ResolutionType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionType_organizationId_name_key" ON "ResolutionType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Resolution_resolutionTypeId_idx" ON "Resolution"("resolutionTypeId");

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_resolutionTypeId_fkey" FOREIGN KEY ("resolutionTypeId") REFERENCES "ResolutionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionType" ADD CONSTRAINT "ResolutionType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: każde istniejące stowarzyszenie dostaje domyślny typ „Uchwała standardowa"
-- (50% głosów, bez wymogu spotkania), a istniejące uchwały zostają mu przypisane.
INSERT INTO "ResolutionType" ("id", "organizationId", "name", "voteThreshold", "requiresMeeting", "order", "createdAt")
SELECT gen_random_uuid()::text, o."id", 'Uchwała standardowa', 50, false, 0, CURRENT_TIMESTAMP
FROM "Organization" o;

UPDATE "Resolution" r
SET "resolutionTypeId" = rt."id"
FROM "ResolutionType" rt
WHERE rt."organizationId" = r."organizationId";
