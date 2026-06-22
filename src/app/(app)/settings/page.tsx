import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/client";
import { ApplicationFieldsManager } from "@/components/application-fields-manager";
import { PaymentSettings } from "@/components/payment-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FIXED_FIELDS = ["Imię", "Nazwisko", "Adres e-mail", "Data urodzenia"];

export default async function SettingsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  await requireMember(orgId, [Role.OWNER, Role.BOARD]);

  const [fields, org, tiers] = await Promise.all([
    prisma.applicationField.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
      select: { id: true, label: true, required: true },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { membershipPaid: true },
    }),
    prisma.paymentTier.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
      select: { id: true, label: true, amount: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Ustawienia</h1>
        <p className="text-muted-foreground">
          Konfiguracja stowarzyszenia „{data.active.organization.name}”.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Formularz zgłoszeniowy</CardTitle>
          <CardDescription>
            Pola stałe są zawsze obecne. Możesz dodać własne pola tekstowe, które
            pojawią się na publicznym formularzu zgłoszeniowym.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Pola stałe (niezmienne)
            </h3>
            <ul className="divide-y rounded-md border bg-muted/30">
              {FIXED_FIELDS.map((label) => (
                <li
                  key={label}
                  className="px-3 py-2 text-sm text-muted-foreground"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Pola własne
            </h3>
            <ApplicationFieldsManager organizationId={orgId} fields={fields} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Składki członkowskie</CardTitle>
          <CardDescription>
            Określ, czy członkostwo jest płatne, i zdefiniuj progi składki, spośród
            których wybierze osoba wypełniająca formularz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentSettings
            organizationId={orgId}
            membershipPaid={org?.membershipPaid ?? false}
            tiers={tiers}
          />
        </CardContent>
      </Card>
    </div>
  );
}
