import { redirect } from "next/navigation";
import { getActiveOrg, requireMembership } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ApplicationStatus, Role } from "@/generated/prisma/client";
import { ApplicationActions } from "@/components/application-actions";
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

const STATUS: Record<
  ApplicationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  PENDING: { label: "Oczekuje", variant: "default" },
  APPROVED: { label: "Zatwierdzone", variant: "secondary" },
  REJECTED: { label: "Odrzucone", variant: "destructive" },
};

export default async function ApplicationsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  await requireMembership(orgId, [Role.OWNER, Role.BOARD]);

  const applications = await prisma.membershipApplication.findMany({
    where: { organizationId: orgId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // PENDING najpierw
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Zgłoszenia</h1>
        <p className="text-muted-foreground">
          Rozpatrz zgłoszenia osób, które chcą dołączyć do stowarzyszenia.
        </p>
      </div>

      {applications.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          Brak zgłoszeń.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Imię i nazwisko</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Data urodzenia</TableHead>
              <TableHead>Zgłoszono</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.firstName} {a.lastName}
                </TableCell>
                <TableCell>{a.email}</TableCell>
                <TableCell>{dateFmt.format(a.birthDate)}</TableCell>
                <TableCell>{dateFmt.format(a.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS[a.status].variant}>
                    {STATUS[a.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {a.status === ApplicationStatus.PENDING ? (
                    <ApplicationActions applicationId={a.id} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
