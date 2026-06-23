import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { InviteLinkCard } from "@/components/invite-link-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });

export default async function MembersPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  // Podgląd listy wymaga MEMBERS≥READ; zarządzanie (link, dane wrażliwe) → MEMBERS WRITE.
  const me = await requireMember(orgId, "MEMBERS", "READ");
  const isAdmin = can(me.role, "MEMBERS", "WRITE");

  const [org, members] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { inviteToken: true, inviteEnabled: true },
    }),
    prisma.member.findMany({
      where: { organizationId: orgId },
      include: { role: { select: { name: true, isOwner: true } } },
      // Właściciel na górze, potem alfabetycznie.
      orderBy: [
        { role: { isOwner: "desc" } },
        { lastName: "asc" },
        { firstName: "asc" },
      ],
    }),
  ]);

  const inviteUrl = org?.inviteToken
    ? await buildInviteUrl(org.inviteToken)
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Członkowie</h1>
        <p className="text-muted-foreground">Liczba członków: {members.length}</p>
      </div>

      {isAdmin ? (
        <InviteLinkCard
          organizationId={orgId}
          inviteUrl={inviteUrl}
          enabled={org?.inviteEnabled ?? false}
        />
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nazwisko</TableHead>
            <TableHead>Imię</TableHead>
            <TableHead>Rola</TableHead>
            {isAdmin ? <TableHead>E-mail</TableHead> : null}
            {isAdmin ? <TableHead>Data urodzenia</TableHead> : null}
            <TableHead>Data dołączenia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.lastName ?? "—"}</TableCell>
              <TableCell>{m.firstName}</TableCell>
              <TableCell>
                <Badge variant={m.role.isOwner ? "default" : "secondary"}>
                  {m.role.name}
                </Badge>
              </TableCell>
              {isAdmin ? <TableCell>{m.email}</TableCell> : null}
              {isAdmin ? (
                <TableCell>
                  {m.birthDate ? dateFmt.format(m.birthDate) : "—"}
                </TableCell>
              ) : null}
              <TableCell>{dateFmt.format(m.joinedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Buduje absolutny URL zaproszenia z nagłówków żądania (dev i produkcja).
async function buildInviteUrl(token: string) {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/join/${token}`;
}
