-- AlterTable: flaga pokazywania roli na formularzu zgłoszeniowym
ALTER TABLE "Role" ADD COLUMN "showInForm" BOOLEAN NOT NULL DEFAULT false;

-- Rola domyślna (Członek) jest zawsze pokazana na formularzu — ustaw flagę dla
-- istniejących stowarzyszeń, by stan w bazie był spójny z zachowaniem aplikacji.
UPDATE "Role" SET "showInForm" = true WHERE "isDefault" = true;

-- AlterTable: rola wybrana przez zgłaszającego na formularzu
ALTER TABLE "MembershipApplication" ADD COLUMN "selectedRoleId" TEXT;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_selectedRoleId_fkey" FOREIGN KEY ("selectedRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
