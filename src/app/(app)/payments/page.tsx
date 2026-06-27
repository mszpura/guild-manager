import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatFeeDueDate, isFeeOverdue } from "@/lib/payments";
import { FeesManager, type FeeRow } from "@/components/fees-manager";

export default async function PaymentsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  // Podgląd rejestru składek wymaga MEMBERS≥READ; oznaczanie wpłat → MEMBERS WRITE.
  const me = await requireMember(orgId, "MEMBERS", "READ");
  const canManage = can(me.role, "MEMBERS", "WRITE");

  const now = new Date();
  const year = now.getFullYear();

  const [org, members] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { membershipPaid: true, feeDueMonth: true, feeDueDay: true },
    }),
    prisma.member.findMany({
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
        role: { select: { name: true } },
        membershipFees: {
          where: { year },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);

  const dueLabel = formatFeeDueDate(org?.feeDueMonth, org?.feeDueDay);
  const overdue = isFeeOverdue(org?.feeDueMonth, org?.feeDueDay, year, now);

  const rows: FeeRow[] = members.map((m) => {
    const paid = m.membershipFees.length > 0;
    const fullName = [m.firstName, m.lastName].filter(Boolean).join(" ");
    return {
      memberId: m.id,
      name: fullName,
      initials: initials(m.firstName, m.lastName),
      roleName: m.role.name,
      status: paid ? "PAID" : overdue ? "OVERDUE" : "PENDING",
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Składki</h1>
          <p className="text-sm text-muted-foreground">
            Rejestr składek członkowskich · rok rozliczeniowy {year}
            {dueLabel ? ` · termin do ${dueLabel}` : ""}
          </p>
        </div>
      </div>

      {org?.membershipPaid ? (
        <FeesManager
          year={year}
          rows={rows}
          canManage={canManage}
          hasDueDate={dueLabel != null}
        />
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
