import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveOrg, requireMembership } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/client";
import { InviteLinkCard } from "@/components/invite-link-card";
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
  await requireMembership(orgId, [Role.OWNER, Role.BOARD]);

  const [org, members] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { inviteToken: true, inviteEnabled: true },
    }),
    prisma.member.findMany({
      where: { organizationId: orgId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const inviteUrl = org?.inviteToken
    ? `${proto}://${host}/join/${org.inviteToken}`
    : "";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Członkowie</h1>
        <p className="text-muted-foreground">
          {members.length === 0
            ? "Brak członków — roześlij link zapraszający poniżej."
            : `Liczba członków: ${members.length}`}
        </p>
      </div>

      <InviteLinkCard
        organizationId={orgId}
        inviteUrl={inviteUrl}
        enabled={org?.inviteEnabled ?? false}
      />

      {members.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwisko</TableHead>
              <TableHead>Imię</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Data urodzenia</TableHead>
              <TableHead>Dołączył(a)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.lastName}</TableCell>
                <TableCell>{m.firstName}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>{dateFmt.format(m.birthDate)}</TableCell>
                <TableCell>{dateFmt.format(m.joinedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
