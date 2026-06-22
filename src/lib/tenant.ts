import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, Role } from "@/generated/prisma/client";

// Sesja zalogowanego użytkownika. cache() = jedno zapytanie na render.
export const getSession = cache(async () => auth());

// Lekki widok członka + stowarzyszenia dla nawigacji/przełącznika.
// Świadomie NIE dołączamy inviteToken ani danych osobowych — payload trafia do
// klienta (OrgSwitcher), a token zarządza wyłącznie administrator.
const memberWithOrgSelect = {
  id: true,
  organizationId: true,
  role: true,
  organization: { select: { id: true, name: true } },
} satisfies Prisma.MemberSelect;

export type MemberWithOrg = Prisma.MemberGetPayload<{
  select: typeof memberWithOrgSelect;
}>;

// Dostęp do stowarzyszenia wynika z dopasowania e-maila zalogowanego użytkownika
// do wpisu Member. Zwraca wszystkie członkostwa użytkownika oraz aktywne.
// null  → użytkownik niezalogowany.
// active: null → zalogowany, ale nie należy jeszcze do żadnego stowarzyszenia.
export async function getActiveOrg() {
  const session = await getSession();
  if (!session?.user) return null;

  const email = session.user.email?.toLowerCase();
  if (!email) {
    return { members: [] as MemberWithOrg[], active: null as MemberWithOrg | null };
  }

  const members = await prisma.member.findMany({
    where: { email },
    select: memberWithOrgSelect,
    orderBy: { joinedAt: "asc" },
  });

  if (members.length === 0) {
    return { members, active: null as MemberWithOrg | null };
  }

  const activeId = session.user.activeOrganizationId;
  const active =
    members.find((m) => m.organizationId === activeId) ?? members[0];

  return { members, active };
}

// Wymusza, że zalogowany użytkownik należy do danego stowarzyszenia
// (opcjonalnie z jedną z wymaganych ról) — dopasowanie po e-mailu. Podstawa
// każdej operacji tenant-scoped; redirect przerywa też akcje serwerowe (twardy deny).
export async function requireMember(organizationId: string, roles?: Role[]) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const email = session.user.email?.toLowerCase();
  if (!email) redirect("/dashboard");

  const member = await prisma.member.findUnique({
    where: { organizationId_email: { organizationId, email } },
  });

  // Brak wpisu → użytkownik nie należy do tej organizacji.
  if (!member) redirect("/dashboard");

  // Niewystarczająca rola → odeślij do pulpitu (bezpieczny dla każdej roli).
  if (roles && !roles.includes(member.role)) redirect("/dashboard");

  return member;
}
