-- AlterTable
-- Migawka liczby uprawnionych do głosowania w chwili rozstrzygnięcia uchwały.
-- Istniejące, już rozstrzygnięte uchwały pozostają z NULL (mianownik liczony
-- dynamicznie jak dotychczas); nowe rozstrzygnięcia zapisują zamrożoną wartość.
ALTER TABLE "Resolution" ADD COLUMN "decidedEligibleCount" INTEGER;
