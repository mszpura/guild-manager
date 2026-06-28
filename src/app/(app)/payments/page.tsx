import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatFeeDueDate } from "@/lib/payments";
import { summarizeFees } from "@/lib/fees";
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

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      membershipPaid: true,
      feeDueMonth: true,
      feeDueDay: true,
      foundedYear: true,
    },
  });
  const dueLabel = formatFeeDueDate(org?.feeDueMonth, org?.feeDueDay);

  const [members, tiers] = await Promise.all([
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
        joinedAt: true,
        paymentTierId: true,
        paymentTier: { select: { amount: true } },
        role: { select: { name: true } },
        // Wszystkie wpłaty członka — potrzebne do salda (zaległości za poprzednie lata).
        membershipFees: { select: { year: true, amount: true } },
      },
    }),
    // Lista składek (progów) z ustawień — do wyboru per członek.
    prisma.paymentTier.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
      select: { id: true, label: true, amount: true },
    }),
  ]);

  const summary = summarizeFees(members, {
    feeDueMonth: org?.feeDueMonth,
    feeDueDay: org?.feeDueDay,
    foundedYear: org?.foundedYear,
    now,
  });
  const { year, collected, charged, arrears, debtorCount } = summary;

  const rows: FeeRow[] = summary.results.map(({ member: m, cycles, saldo, currentStatus }) => ({
    memberId: m.id,
    name: [m.firstName, m.lastName].filter(Boolean).join(" "),
    initials: initials(m.firstName, m.lastName),
    roleName: m.role.name,
    tierId: m.paymentTierId,
    saldo,
    status: currentStatus,
    // Wszystkie opłacone lata — do listy okresów w oknie rozliczenia (także starsze
    // niż siatka cykli, gdy stowarzyszenie istnieje od dawna).
    paidYears: m.membershipFees.map((f) => f.year),
    cycles: cycles.map((c) => ({
      year: c.year,
      short: `'${String(c.year % 100).padStart(2, "0")}`,
      label: String(c.year),
      status: c.status,
    })),
  }));

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
          foundedYear={org?.foundedYear ?? null}
          rows={rows}
          tiers={tiers}
          canManage={canManage}
          collected={collected}
          charged={charged}
          arrears={arrears}
          debtorCount={debtorCount}
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
