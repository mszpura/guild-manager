import type { Role } from "@/generated/prisma/client";

// Czytelne polskie etykiety ról.
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Właściciel",
  BOARD: "Zarząd",
  MEMBER: "Członek",
};
