-- Konfigurowalne typy spotkań: enum MeetingType → model MeetingType (per stowarzyszenie),
-- przeniesienie ról uprawnionych ze spotkania na typ spotkania oraz dodanie wymogu kworum.
-- Migracja zachowuje istniejące dane: dla każdego stowarzyszenia zakłada dwa domyślne
-- typy ("Walne zebranie", "Posiedzenie zarządu") i mapuje na nie dotychczasowe spotkania.

-- 1. Zachowaj dotychczasowy enum spotkania jako tekst (kolumna i enum znikną niżej).
ALTER TABLE "Meeting" ADD COLUMN "_oldType" TEXT;
UPDATE "Meeting" SET "_oldType" = "type"::TEXT;

ALTER TABLE "Meeting" DROP COLUMN "type";
DROP TYPE "MeetingType";

-- 2. Nowe tabele.
CREATE TABLE "MeetingType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresQuorum" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingType_organizationId_idx" ON "MeetingType"("organizationId");
CREATE UNIQUE INDEX "MeetingType_organizationId_name_key" ON "MeetingType"("organizationId", "name");

CREATE TABLE "MeetingTypeRole" (
    "meetingTypeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MeetingTypeRole_pkey" PRIMARY KEY ("meetingTypeId", "roleId")
);

CREATE INDEX "MeetingTypeRole_roleId_idx" ON "MeetingTypeRole"("roleId");

ALTER TABLE "MeetingType" ADD CONSTRAINT "MeetingType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingTypeRole" ADD CONSTRAINT "MeetingTypeRole_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "MeetingType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingTypeRole" ADD CONSTRAINT "MeetingTypeRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Domyślne typy dla każdego istniejącego stowarzyszenia.
--    "Walne zebranie": wszyscy członkowie (brak ról = otwarte), kworum wymagane.
--    "Posiedzenie zarządu": bez Juniorów i zwykłych Członków, kworum wymagane.
INSERT INTO "MeetingType" ("id", "organizationId", "name", "requiresQuorum", "order", "createdAt")
SELECT 'mt_' || replace(gen_random_uuid()::TEXT, '-', ''), o."id", 'Walne zebranie', true, 0, CURRENT_TIMESTAMP
FROM "Organization" o;

INSERT INTO "MeetingType" ("id", "organizationId", "name", "requiresQuorum", "order", "createdAt")
SELECT 'mt_' || replace(gen_random_uuid()::TEXT, '-', ''), o."id", 'Posiedzenie zarządu', true, 1, CURRENT_TIMESTAMP
FROM "Organization" o;

-- Posiedzenie zarządu: dołącz wszystkie role poza Juniorem i zwykłym Członkiem.
INSERT INTO "MeetingTypeRole" ("meetingTypeId", "roleId")
SELECT mt."id", r."id"
FROM "MeetingType" mt
JOIN "Role" r ON r."organizationId" = mt."organizationId"
WHERE mt."name" = 'Posiedzenie zarządu'
  AND r."name" NOT IN ('Junior', 'Członek');

-- 4. Powiąż spotkania z nowymi typami (na podstawie dawnego enuma).
ALTER TABLE "Meeting" ADD COLUMN "meetingTypeId" TEXT;

UPDATE "Meeting" m
SET "meetingTypeId" = mt."id"
FROM "MeetingType" mt
WHERE mt."organizationId" = m."organizationId"
  AND mt."name" = CASE m."_oldType"
    WHEN 'GENERAL_ASSEMBLY' THEN 'Walne zebranie'
    WHEN 'BOARD_MEETING' THEN 'Posiedzenie zarządu'
  END;

ALTER TABLE "Meeting" ALTER COLUMN "meetingTypeId" SET NOT NULL;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "MeetingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Meeting_meetingTypeId_idx" ON "Meeting"("meetingTypeId");

-- 5. Usuń pozostałości starego modelu (role per spotkanie + kolumna pomocnicza).
DROP TABLE "MeetingRole";
ALTER TABLE "Meeting" DROP COLUMN "_oldType";
