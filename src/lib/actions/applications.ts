"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/tenant";
import { buildApplicationSchema } from "@/lib/validations";
import { extractLinkId, buildLinkUrl } from "@/lib/links";
import { sendWelcomeEmail, sendPaymentLinkEmail } from "@/lib/email";
import { getStripe, createCheckoutSession } from "@/lib/stripe";
import { formatPLN } from "@/lib/money";
import { ApplicationStatus, PaymentStatus } from "@/generated/prisma/client";

export type ApplicationFormState =
  | { ok?: boolean; error?: string }
  | undefined;

// PUBLICZNA akcja — wywoływana z formularza na /join/<token>. Bez sesji.
// `token` jest dowiązany po stronie klienta (action.bind(null, token)).
export async function submitApplication(
  token: string,
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  // Stowarzyszenie identyfikowane wyłącznie przez aktywny token (tajność = dostęp).
  // Pobierane przed walidacją, bo schemat pól standardowych zależy od konfiguracji.
  const org = await prisma.organization.findFirst({
    where: { inviteToken: token, inviteEnabled: true },
    select: {
      id: true,
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
      // „Pokaż w formularzu", bez Prezesa. Składka zgłaszającego wynika z wybranej
      // roli (feeAmount); null = rola zwolniona ze składek. Domyślna pierwsza.
      roles: {
        where: { isOwner: false, OR: [{ showInForm: true }, { isDefault: true }] },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true, feeAmount: true, isDefault: true },
      },
    },
  });
  if (!org) {
    return { error: "Ten link zaproszeniowy jest nieaktywny lub nieprawidłowy." };
  }

  // Walidacja zależna od trybów pól standardowych (ukryte pomijamy w całości).
  const schema = buildApplicationSchema({
    birthDate: org.formBirthDate,
    phone: org.formPhone,
    address: org.formAddress,
  });
  const parsed = schema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    birthDate: formData.get("birthDate"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  // Walidacja i migawka pól własnych. Dane publiczne → walidujemy po stronie serwera.
  // Pola-linki: z wpisu użytkownika wyłuskujemy sam identyfikator i dokładamy gotowy
  // adres (snapshot { label, value: id, linkType, url }).
  const customData: Record<string, string>[] = [];
  for (const field of org.applicationFields) {
    const raw = String(formData.get(`custom_${field.id}`) ?? "").trim();
    if (field.linkType) {
      const id = extractLinkId(field.linkType, raw);
      if (field.required && !id) {
        return { error: `Pole „${field.label}" jest wymagane.` };
      }
      if (id) {
        customData.push({
          label: field.label,
          value: id,
          linkType: field.linkType,
          url: buildLinkUrl(field.linkType, id),
        });
      }
    } else {
      if (field.required && !raw) {
        return { error: `Pole „${field.label}" jest wymagane.` };
      }
      if (raw) customData.push({ label: field.label, value: raw });
    }
  }

  // Pola standardowe wg konfiguracji: ukryte → undefined, opcjonalne puste → null.
  const data = parsed.data as {
    firstName: string;
    lastName: string;
    email: string;
    birthDate?: Date | null;
    phone?: string | null;
    address?: string | null;
  };
  const { firstName, lastName, email } = data;
  const birthDate = data.birthDate ?? null;
  const phone = data.phone ?? null;
  const address = data.address ?? null;

  // Reguła: jeden e-mail = jeden członek danego stowarzyszenia.
  const alreadyMember = await prisma.member.findUnique({
    where: { organizationId_email: { organizationId: org.id, email } },
    select: { id: true },
  });
  if (alreadyMember) {
    return { error: "Ten adres e-mail jest już członkiem tego stowarzyszenia." };
  }

  const pending = await prisma.membershipApplication.findFirst({
    where: { organizationId: org.id, email, status: ApplicationStatus.PENDING },
    select: { id: true },
  });
  if (pending) {
    return { error: "Zgłoszenie z tym adresem e-mail już oczekuje na rozpatrzenie." };
  }

  // Wybór roli ze zgłoszenia. Walidujemy względem ról dostępnych na formularzu —
  // wartość spoza listy (lub brak, gdy do wyboru była tylko jedna rola) sprowadzamy
  // do roli domyślnej. Zarząd i tak zweryfikuje wybór przy zatwierdzaniu.
  const selectedRoleId = String(formData.get("selectedRoleId") ?? "").trim();
  const defaultRole = org.roles.find((r) => r.isDefault) ?? org.roles[0];
  const selectedRole =
    org.roles.find((r) => r.id === selectedRoleId) ?? defaultRole;

  // Składka zgłaszającego = roczna składka wybranej roli. null = zwolniona.
  const fee =
    org.membershipPaid && selectedRole && selectedRole.feeAmount != null
      ? { label: selectedRole.name, amount: selectedRole.feeAmount }
      : undefined;
  // Czy zgłoszenie wymaga płatności (płatne członkostwo + składka roli domyślnej).
  const paid = !!fee;
  // Zgłaszający może pominąć płatność online (opłaci przelewem lub ma już opłacone).
  const skipPayment = formData.get("skipPayment") === "on";
  // Płatność online prowadzimy tylko, gdy składka wymagana i niepominięta.
  const onlinePayment = paid && !skipPayment;

  // Płatność włączona, ale brak skonfigurowanego Stripe → nie blokuj 500-tką.
  if (onlinePayment && !getStripe()) {
    return {
      error:
        "Płatności nie są obecnie skonfigurowane. Skontaktuj się z administratorem.",
    };
  }

  const application = await prisma.membershipApplication.create({
    data: {
      organizationId: org.id,
      firstName,
      lastName,
      email,
      birthDate,
      phone,
      address,
      customData: customData.length > 0 ? customData : undefined,
      // Rola wybrana przez zgłaszającego (Zarząd zweryfikuje przy zatwierdzaniu).
      selectedRoleId: selectedRole?.id,
      // Pominięcie płatności online pozostawia status „oczekuje" — administrator
      // potwierdza wpłatę (np. przelew) przy rozpatrywaniu zgłoszenia.
      paymentStatus: paid ? PaymentStatus.PENDING : PaymentStatus.NOT_REQUIRED,
      paymentTierLabel: fee?.label,
      paymentAmount: fee?.amount,
    },
  });

  // Bezpłatne członkostwo lub płatność pominięta — koniec, zgłoszenie czeka na rozpatrzenie.
  if (!onlinePayment || !fee) {
    return { ok: true };
  }

  // Płatne — utwórz sesję Stripe Checkout, zapisz link, wyślij e-mail, przekieruj.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;

  const session = await createCheckoutSession({
    amount: fee.amount,
    label: fee.label,
    email,
    applicationId: application.id,
    successUrl: `${base}/join/${token}/dziekujemy`,
    cancelUrl: `${base}/join/${token}`,
  });

  if (!session) {
    // Nie zostawiaj osieroconego wniosku, jeśli płatności nie da się rozpocząć.
    await prisma.membershipApplication.delete({ where: { id: application.id } });
    return {
      error: "Nie udało się rozpocząć płatności. Spróbuj ponownie później.",
    };
  }

  await prisma.membershipApplication.update({
    where: { id: application.id },
    data: { stripeSessionId: session.id, paymentUrl: session.url },
  });

  // E-mail z linkiem do płatności (na wypadek nieukończonej płatności) — miękki błąd.
  await sendPaymentLinkEmail({
    to: email,
    firstName,
    organizationName: org.name,
    amountText: formatPLN(fee.amount),
    paymentUrl: session.url,
  });

  redirect(session.url);
}

// Zatwierdza zgłoszenie: tworzy członka, oznacza zgłoszenie, wysyła e-mail powitalny.
// Dostęp: OWNER/BOARD danego stowarzyszenia. `roleId` — opcjonalne nadpisanie roli
// przez Zarząd (weryfikacja wyboru zgłaszającego); bez niego stosujemy rolę wybraną
// na formularzu, a w razie jej braku/nieprawidłowości rolę domyślną.
export async function approveApplication(applicationId: string, roleId?: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const application = await prisma.membershipApplication.findUnique({
    where: { id: applicationId },
    include: { organization: { select: { name: true } } },
  });
  if (!application) throw new Error("Zgłoszenie nie istnieje.");

  await requireMember(application.organizationId, "APPLICATIONS", "WRITE");

  if (application.status !== ApplicationStatus.PENDING) {
    throw new Error("To zgłoszenie zostało już rozpatrzone.");
  }

  // Rola nadawana zatwierdzonemu: wybór Zarządu (roleId) → rola wybrana na formularzu
  // (selectedRoleId) → rola domyślna. Każda musi należeć do tego stowarzyszenia i nie
  // może być rolą Prezesa (jedyny właściciel nadawany przy zakładaniu).
  const orgRoles = await prisma.role.findMany({
    where: { organizationId: application.organizationId, isOwner: false },
    select: { id: true, isDefault: true },
  });
  const defaultRole = orgRoles.find((r) => r.isDefault);
  if (!defaultRole) throw new Error("Brak domyślnej roli w stowarzyszeniu.");
  const targetRole =
    orgRoles.find((r) => r.id === roleId) ??
    orgRoles.find((r) => r.id === application.selectedRoleId) ??
    defaultRole;

  // Transakcja: utwórz członka i oznacz zgłoszenie. unique(orgId,email) chroni
  // regułę „jeden e-mail = jeden członek" także przy wyścigu.
  await prisma.$transaction(async (tx) => {
    await tx.member.create({
      data: {
        organizationId: application.organizationId,
        roleId: targetRole.id,
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        // Dane ze zgłoszenia przenoszone do ewidencji członka (pola standardowe
        // wg konfiguracji formularza + migawka pól własnych).
        birthDate: application.birthDate,
        phone: application.phone,
        address: application.address,
        customData: application.customData ?? undefined,
      },
    });
    await tx.membershipApplication.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });
  });

  // E-mail powitalny — miękki błąd: nieudana wysyłka nie cofa zatwierdzenia.
  const emailed = await sendWelcomeEmail({
    to: application.email,
    firstName: application.firstName,
    organizationName: application.organization.name,
  });

  revalidatePath("/applications");
  revalidatePath("/members");
  revalidatePath("/", "layout");

  return { emailed };
}

// Odrzuca zgłoszenie. Dostęp: OWNER/BOARD.
export async function rejectApplication(applicationId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const application = await prisma.membershipApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, organizationId: true, status: true },
  });
  if (!application) throw new Error("Zgłoszenie nie istnieje.");

  await requireMember(application.organizationId, "APPLICATIONS", "WRITE");

  if (application.status !== ApplicationStatus.PENDING) {
    throw new Error("To zgłoszenie zostało już rozpatrzone.");
  }

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: {
      status: ApplicationStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    },
  });

  revalidatePath("/applications");
  revalidatePath("/", "layout");
}
