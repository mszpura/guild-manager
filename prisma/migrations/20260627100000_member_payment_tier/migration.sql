-- Member: zamiana wolnej kwoty (feeAmount) na referencję do progu składki (paymentTierId).

-- 1) Nowa kolumna FK.
ALTER TABLE "Member" ADD COLUMN "paymentTierId" TEXT;

-- 2) Backfill: dopasuj członka do progu o tej samej kwocie w jego stowarzyszeniu.
UPDATE "Member" m
SET "paymentTierId" = (
  SELECT t.id FROM "PaymentTier" t
  WHERE t."organizationId" = m."organizationId" AND t.amount = m."feeAmount"
  ORDER BY t."order" ASC
  LIMIT 1
)
WHERE m."feeAmount" IS NOT NULL;

-- 3) Usuń starą kolumnę.
ALTER TABLE "Member" DROP COLUMN "feeAmount";

-- 4) Indeks + klucz obcy (SET NULL przy usunięciu progu).
CREATE INDEX "Member_paymentTierId_idx" ON "Member"("paymentTierId");

ALTER TABLE "Member" ADD CONSTRAINT "Member_paymentTierId_fkey"
  FOREIGN KEY ("paymentTierId") REFERENCES "PaymentTier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
