import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ApplicationFieldsManager } from "@/components/application-fields-manager";
import { FormFieldSettings } from "@/components/form-field-settings";
import { PaymentSettings } from "@/components/payment-settings";
import { RolesManager } from "@/components/roles-manager";
import { MeetingTypesManager } from "@/components/meeting-types-manager";
import { OrgDetailsForm } from "@/components/org-details-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Pola zawsze obecne na formularzu (nie podlegają konfiguracji).
const FIXED_FIELDS = ["Imię", "Nazwisko", "Adres e-mail"];

export default async function SettingsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  await requireMember(orgId, "SETTINGS", "WRITE");

  const [fields, org, roles, meetingTypes] = await Promise.all([
    prisma.applicationField.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
      select: { id: true, label: true, required: true, linkType: true },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        krs: true,
        nip: true,
        regon: true,
        foundedYear: true,
        contactEmail: true,
        phone: true,
        street: true,
        postalCode: true,
        city: true,
        description: true,
        logoUrl: true,
        membershipPaid: true,
        feeDueMonth: true,
        feeDueDay: true,
        formBirthDate: true,
        formPhone: true,
        formAddress: true,
      },
    }),
    prisma.role.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isOwner: "desc" }, { isSystem: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        permissions: true,
        isOwner: true,
        isSystem: true,
        isDefault: true,
        feeAmount: true,
        showInForm: true,
        canVote: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.meetingType.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        requiresQuorum: true,
        roles: { select: { roleId: true } },
        _count: { select: { meetings: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzaj danymi i konfiguracją stowarzyszenia
        </p>
      </div>

      <Tabs defaultValue="org">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-[30px] rounded-none border-b bg-transparent p-0"
        >
          {[
            ["org", "Stowarzyszenie"],
            ["roles", "Role"],
            ["form", "Formularz"],
            ["payments", "Składki"],
            ["meetings", "Spotkania"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="-mb-px flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent px-0.5 pb-3.5 text-sm font-semibold text-muted-foreground shadow-none after:hidden hover:text-foreground data-active:border-b-primary data-active:font-bold data-active:text-foreground data-active:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="org">
          <OrgDetailsForm
            organizationId={orgId}
            org={{
              name: org?.name ?? "",
              krs: org?.krs ?? null,
              nip: org?.nip ?? null,
              regon: org?.regon ?? null,
              foundedYear: org?.foundedYear ?? null,
              contactEmail: org?.contactEmail ?? null,
              phone: org?.phone ?? null,
              street: org?.street ?? null,
              postalCode: org?.postalCode ?? null,
              city: org?.city ?? null,
              description: org?.description ?? null,
              logoUrl: org?.logoUrl ?? null,
            }}
          />
        </TabsContent>

        <TabsContent value="form">
          <Card>
            <CardHeader>
              <CardTitle>Formularz zgłoszeniowy</CardTitle>
              <CardDescription>
                Pola stałe są zawsze obecne. Możesz dodać własne pola tekstowe
                oraz linki (Facebook, LinkedIn, EGD), które pojawią się na
                publicznym formularzu zgłoszeniowym.
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
                  Pola standardowe
                </h3>
                <FormFieldSettings
                  organizationId={orgId}
                  modes={{
                    birthDate: org?.formBirthDate ?? "REQUIRED",
                    phone: org?.formPhone ?? "HIDDEN",
                    address: org?.formAddress ?? "HIDDEN",
                  }}
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Pola własne
                </h3>
                <ApplicationFieldsManager
                  organizationId={orgId}
                  fields={fields}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Składki członkowskie</CardTitle>
              <CardDescription>
                Określ, czy członkostwo jest płatne, i ustal roczną składkę
                osobno dla każdej roli (rola bez kwoty jest zwolniona ze składek).
                Zaznacz też, które role mają być dostępne do wyboru na formularzu
                zgłoszeniowym.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentSettings
                organizationId={orgId}
                membershipPaid={org?.membershipPaid ?? false}
                roles={roles.map((r) => ({
                  id: r.id,
                  name: r.name,
                  feeAmount: r.feeAmount,
                  isOwner: r.isOwner,
                  isDefault: r.isDefault,
                  showInForm: r.showInForm,
                }))}
                feeDueMonth={org?.feeDueMonth ?? null}
                feeDueDay={org?.feeDueDay ?? null}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <RolesManager
            organizationId={orgId}
            roles={roles.map((r) => ({
              id: r.id,
              name: r.name,
              permissions: r.permissions,
              isOwner: r.isOwner,
              isSystem: r.isSystem,
              canVote: r.canVote,
              memberCount: r._count.members,
            }))}
          />
        </TabsContent>

        <TabsContent value="meetings">
          <MeetingTypesManager
            organizationId={orgId}
            meetingTypes={meetingTypes.map((t) => ({
              id: t.id,
              name: t.name,
              requiresQuorum: t.requiresQuorum,
              roleIds: t.roles.map((r) => r.roleId),
              meetingCount: t._count.meetings,
            }))}
            roles={roles.map((r) => ({ id: r.id, name: r.name }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
