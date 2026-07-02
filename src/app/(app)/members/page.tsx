import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { summarizeFees } from "@/lib/fees";
import { formatPLN } from "@/lib/money";
import { MembersBoard, type BoardMember } from "@/components/members-board";

// Data dołączenia w formacie MM.RRRR (spójnie z projektem — kolumna „CZŁONEK OD").
function sinceLabel(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function initials(firstName: string, lastName: string | null): string {
  return `${firstName.charAt(0)}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

export default async function MembersPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  // Podgląd listy wymaga MEMBERS≥READ; zarządzanie (dane wrażliwe, składki) → MEMBERS WRITE.
  const me = await requireMember(orgId, "MEMBERS", "READ");
  const isAdmin = can(me.role, "MEMBERS", "WRITE");
  const canViewApplications = can(me.role, "APPLICATIONS", "READ");

  const [org, members, roles, pendingApplications] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        membershipPaid: true,
        feeDueMonth: true,
        feeDueDay: true,
        foundedYear: true,
      },
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
        email: true,
        joinedAt: true,
        roleId: true,
        role: {
          select: { name: true, isOwner: true, canVote: true, feeAmount: true },
        },
        membershipFees: { select: { year: true, amount: true } },
      },
    }),
    // Role do filtrów (Wszyscy + role) oraz do zmiany roli członka (zarządzający).
    prisma.role.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isOwner: "desc" }, { isSystem: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    isAdmin
      ? prisma.membershipApplication.count({
          where: { organizationId: orgId, status: "PENDING" },
        })
      : Promise.resolve(0),
  ]);

  const membershipPaid = org?.membershipPaid ?? false;

  // Status składki bieżącego roku per członek (kolejność zachowana → indeksowanie).
  const fees = summarizeFees(
    members.map((m) => ({
      joinedAt: m.joinedAt,
      feeAmount: m.role.feeAmount,
      membershipFees: m.membershipFees,
    })),
    {
      feeDueMonth: org?.feeDueMonth,
      feeDueDay: org?.feeDueDay,
      foundedYear: org?.foundedYear,
      now: new Date(),
    },
  );

  const boardMembers: BoardMember[] = members.map((m, i) => ({
    id: m.id,
    roleId: m.roleId,
    initials: initials(m.firstName, m.lastName),
    name: `${m.firstName} ${m.lastName ?? ""}`.trim(),
    email: isAdmin ? m.email : "",
    roleName: m.role.name,
    isOwnerRole: m.role.isOwner,
    since: sinceLabel(m.joinedAt),
    // Bez opłat członkostwa składka nie ma zastosowania → „—".
    duesStatus: membershipPaid ? fees.results[i].currentStatus : "NA",
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          Członkowie
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rejestr członków stowarzyszenia — zarząd i członkowie zwyczajni.
        </p>
      </div>

      <MembersBoard
        members={boardMembers}
        roles={roles}
        isAdmin={isAdmin}
        membershipPaid={membershipPaid}
        feeYear={fees.year}
        canViewApplications={canViewApplications}
        stats={{
          total: members.length,
          active: members.filter((m) => m.role.canVote).length,
          pendingApplications,
          debtorCount: membershipPaid ? fees.debtorCount : 0,
          arrears: formatPLN(fees.arrears),
        }}
      />
    </div>
  );
}
