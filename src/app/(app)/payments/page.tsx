import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { currentFeePeriod, recentFeePeriods } from "@/lib/payments";
import {
  FeesManager,
  type CycleStatus,
  type FeeRow,
} from "@/components/fees-manager";

export default async function PaymentsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  // Podgląd rejestru składek wymaga MEMBERS≥READ; oznaczanie wpłat → MEMBERS WRITE.
  const me = await requireMember(orgId, "MEMBERS", "READ");
  const canManage = can(me.role, "MEMBERS", "WRITE");

  const now = new Date();

  // Okres składkowy wyznacza dzień rozliczeniowy z ustawień (a nie 1 stycznia).
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { membershipPaid: true, feeDueMonth: true, feeDueDay: true },
  });
  const period = currentFeePeriod(org?.feeDueMonth, org?.feeDueDay, now);
  // Kilka ostatnich cykli składkowych — do siatki jak w szablonie (najstarszy → bieżący).
  const periods = recentFeePeriods(org?.feeDueMonth, org?.feeDueDay, now, 3);
  const periodYears = periods.map((p) => p.year);

  const members = await prisma.member.findMany({
    where: { organizationId: orgId },
    orderBy: [
      { role: { isOwner: "desc" } },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      joinedAt: true,
      role: { select: { name: true } },
      membershipFees: {
        where: { year: { in: periodYears } },
        select: { year: true },
      },
    },
  });

  const nowMs = now.getTime();

  const rows: FeeRow[] = members.map((m) => {
    const paidYears = new Set(m.membershipFees.map((f) => f.year));
    const joinedMs = m.joinedAt.getTime();

    const cycles = periods.map((p) => {
      let status: CycleStatus;
      if (joinedMs > p.endsAt.getTime()) {
        status = "NA"; // członek nie należał jeszcze w tym okresie
      } else if (paidYears.has(p.year)) {
        status = "PAID";
      } else if (nowMs > p.endsAt.getTime()) {
        status = "OVERDUE"; // minął termin, brak wpłaty
      } else {
        status = "PENDING"; // bieżący okres, jeszcze przed terminem
      }
      return {
        year: p.year,
        short: `'${String(p.year % 100).padStart(2, "0")}`,
        label: p.label,
        status,
      };
    });

    // Status bieżącego okresu = ostatni cykl (steruje filtrami/statystykami). Dla
    // obecnego członka cykl bieżący nigdy nie jest „NA", ale zawężamy typ na wszelki wypadek.
    const last = cycles[cycles.length - 1].status;
    const status: FeeRow["status"] = last === "NA" ? "PENDING" : last;

    const fullName = [m.firstName, m.lastName].filter(Boolean).join(" ");
    return {
      memberId: m.id,
      name: fullName,
      initials: initials(m.firstName, m.lastName),
      roleName: m.role.name,
      status,
      cycles,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Składki</h1>
          <p className="text-sm text-muted-foreground">
            Rejestr składek członkowskich · okres składkowy {period.label}
          </p>
        </div>
      </div>

      {org?.membershipPaid ? (
        <FeesManager year={period.year} rows={rows} canManage={canManage} />
      ) : (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Członkostwo jest obecnie bezpłatne, więc rejestr składek jest pusty.
          </p>
          {can(me.role, "SETTINGS", "WRITE") ? (
            <p className="mt-2 text-sm">
              Włącz płatne członkostwo w{" "}
              <Link
                href="/settings"
                className="font-semibold text-primary hover:underline"
              >
                ustawieniach
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Inicjały z imienia i nazwiska (np. „Marek Kowalski" → „MK").
function initials(firstName: string, lastName: string | null): string {
  const a = firstName.trim()[0] ?? "";
  const b = lastName?.trim()[0] ?? "";
  return (a + b || a || "?").toUpperCase();
}
