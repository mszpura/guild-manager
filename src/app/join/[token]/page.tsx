import { prisma } from "@/lib/prisma";
import { ApplicationForm } from "@/components/application-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Strona PUBLICZNA (poza grupą (app), bez logowania). Identyfikuje stowarzyszenie
// po tokenie z URL-a. Token nieaktywny/nieprawidłowy → przyjazny komunikat.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const org = await prisma.organization.findFirst({
    where: { inviteToken: token, inviteEnabled: true },
    select: {
      name: true,
      membershipPaid: true,
      formBirthDate: true,
      formPhone: true,
      formAddress: true,
      applicationFields: {
        orderBy: { order: "asc" },
        select: { id: true, label: true, required: true, linkType: true },
      },
      // Role dostępne na formularzu: domyślna (Członek) zawsze + oznaczone
      // „Pokaż w formularzu", z wyłączeniem Prezesa. Gdy jest ich więcej niż jedna,
      // zgłaszający wybiera rolę, do której dołącza (i którą opłaca). Składka wynika
      // z roli (feeAmount); null = rola zwolniona ze składek. Domyślna pierwsza.
      roles: {
        where: { isOwner: false, OR: [{ showInForm: true }, { isDefault: true }] },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true, feeAmount: true },
      },
    },
  });

  const selectableRoles = org?.roles ?? [];

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        {org ? (
          <>
            <CardHeader>
              <CardTitle>Dołącz do „{org.name}”</CardTitle>
              <CardDescription>
                Wypełnij formularz zgłoszeniowy. Administrator stowarzyszenia
                rozpatrzy Twoje zgłoszenie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApplicationForm
                token={token}
                organizationName={org.name}
                customFields={org.applicationFields}
                fieldModes={{
                  birthDate: org.formBirthDate,
                  phone: org.formPhone,
                  address: org.formAddress,
                }}
                paid={org.membershipPaid}
                roles={selectableRoles}
              />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Zaproszenie nieaktywne</CardTitle>
              <CardDescription>
                Ten link zaproszeniowy jest nieprawidłowy lub został wyłączony.
                Skontaktuj się z osobą, która Ci go przesłała.
              </CardDescription>
            </CardHeader>
          </>
        )}
      </Card>
    </main>
  );
}
