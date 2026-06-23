import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ApplicationStatus, PaymentStatus } from "@/generated/prisma/client";
import { formatPLN } from "@/lib/money";
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

// customData to migawka [{ label, value }] zapisana w chwili zgłoszenia.
function parseCustomData(
  data: Prisma.JsonValue | null,
): { label: string; value: string }[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) =>
    item &&
    typeof item === "object" &&
    "label" in item &&
    "value" in item
      ? [{ label: String(item.label), value: String(item.value) }]
      : [],
  );
}

const STATUS: Record<
  ApplicationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  PENDING: { label: "Oczekuje", variant: "default" },
  APPROVED: { label: "Zatwierdzone", variant: "secondary" },
  REJECTED: { label: "Odrzucone", variant: "destructive" },
};

const PAYMENT: Record<
  PaymentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  NOT_REQUIRED: { label: "—", variant: "secondary" },
  PENDING: { label: "Oczekuje na płatność", variant: "destructive" },
  PAID: { label: "Opłacone", variant: "default" },
};

export default async function ApplicationsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  await requireMember(orgId, "APPLICATIONS", "READ");

  const applications = await prisma.membershipApplication.findMany({
    where: { organizationId: orgId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // PENDING najpierw
  });

  return (
    <div className="space-y-6">
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
              <TableHead>Dodatkowe dane</TableHead>
              <TableHead>Składka</TableHead>
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
                <TableCell>
                  {(() => {
                    const extra = parseCustomData(a.customData);
                    if (extra.length === 0)
                      return <span className="text-muted-foreground">—</span>;
                    return (
                      <ul className="space-y-0.5 text-sm">
                        {extra.map((e, i) => (
                          <li key={i}>
                            <span className="text-muted-foreground">
                              {e.label}:
                            </span>{" "}
                            {e.value}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {a.paymentStatus === PaymentStatus.NOT_REQUIRED ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="space-y-1">
                      {a.paymentTierLabel ? (
                        <div className="text-sm">
                          {a.paymentTierLabel}
                          {a.paymentAmount != null
                            ? ` · ${formatPLN(a.paymentAmount)}`
                            : ""}
                        </div>
                      ) : null}
                      <Badge variant={PAYMENT[a.paymentStatus].variant}>
                        {PAYMENT[a.paymentStatus].label}
                      </Badge>
                    </div>
                  )}
                </TableCell>
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
