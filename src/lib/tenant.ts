import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, Role } from "@/generated/prisma/client";

// Sesja zalogowanego użytkownika. cache() = jedno zapytanie na render.
export const getSession = cache(async () => auth());

// Członkostwo wraz z danymi stowarzyszenia (używane np. w przełączniku organizacji).
export type MembershipWithOrg = Prisma.MembershipGetPayload<{
  include: { organization: true };
}>;

// Zwraca wszystkie członkostwa użytkownika oraz aktualnie aktywne stowarzyszenie.
// null  → użytkownik niezalogowany.
// active: null → zalogowany, ale nie należy jeszcze do żadnego stowarzyszenia.
export async function getActiveOrg() {
  const session = await getSession();
  if (!session?.user) return null;

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    return { memberships, active: null as (typeof memberships)[number] | null };
  }

  const activeId = session.user.activeOrganizationId;
  const active =
    memberships.find((m) => m.organizationId === activeId) ?? memberships[0];

  return { memberships, active };
}

// Wymusza, że zalogowany użytkownik należy do danego stowarzyszenia
// (opcjonalnie z jedną z wymaganych ról). Podstawa każdej operacji
// tenant-scoped — używaj tego zamiast bezpośrednich zapytań do prisma.
export async function requireMembership(
  organizationId: string,
  roles?: Role[],
) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: session.user.id, organizationId },
    },
  });

  // Brak członkostwa → użytkownik nie ma wstępu do tej organizacji.
  if (!membership) redirect("/dashboard");

  if (roles && !roles.includes(membership.role)) {
    throw new Error("Brak uprawnień do wykonania tej operacji.");
  }

  return membership;
}
