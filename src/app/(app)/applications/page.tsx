import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ApplicationStatus, PaymentStatus } from "@/generated/prisma/client";
import { formatPLN } from "@/lib/money";
import { parseCustomData, type CustomDatum } from "@/lib/links";
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
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Zgłoszenia</h1>
        <p className="text-sm text-muted-foreground">
          Rozpatrz zgłoszenia osób, które chcą dołączyć do stowarzyszenia.
        </p>
      </div>

      {applications.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          Brak zgłoszeń.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
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
                <TableCell>
                  {a.birthDate ? dateFmt.format(a.birthDate) : "—"}
                </TableCell>
                <TableCell>
                  {(() => {
                    // Pola standardowe (telefon/adres) + migawka pól własnych razem.
                    const extra: CustomDatum[] = [
                      ...(a.phone ? [{ label: "Telefon", value: a.phone }] : []),
                      ...(a.address
                        ? [{ label: "Adres", value: a.address }]
                        : []),
                      ...parseCustomData(a.customData),
                    ];
                    if (extra.length === 0)
                      return <span className="text-muted-foreground">—</span>;
                    return (
                      <ul className="space-y-0.5 text-sm">
                        {extra.map((e, i) => (
                          <li key={i}>
                            <span className="text-muted-foreground">
                              {e.label}:
                            </span>{" "}
                            {e.url ? (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary hover:underline"
                              >
                                {e.value} ↗
                              </a>
                            ) : (
                              e.value
                            )}
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
        </div>
      )}
    </div>
  );
}
