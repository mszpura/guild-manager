"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/tenant";
import { buildApplicationSchema } from "@/lib/validations";
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
        select: { id: true, label: true, required: true },
      },
      paymentTiers: {
        orderBy: { order: "asc" },
        select: { id: true, label: true, amount: true },
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
  const customData: { label: string; value: string }[] = [];
  for (const field of org.applicationFields) {
    const value = String(formData.get(`custom_${field.id}`) ?? "").trim();
    if (field.required && !value) {
      return { error: `Pole „${field.label}" jest wymagane.` };
    }
    if (value) customData.push({ label: field.label, value });
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

  // Czy zgłoszenie wymaga płatności (płatne członkostwo + zdefiniowane progi).
  const paid = org.membershipPaid && org.paymentTiers.length > 0;
  // Zgłaszający może pominąć płatność online (opłaci przelewem lub ma już opłacone).
  const skipPayment = formData.get("skipPayment") === "on";
  // Płatność online prowadzimy tylko, gdy składka wymagana i niepominięta.
  const onlinePayment = paid && !skipPayment;

  let tier: { id: string; label: string; amount: number } | undefined;
  if (paid) {
    const tierId = String(formData.get("paymentTier") ?? "");
    tier = org.paymentTiers.find((t) => t.id === tierId);
    if (!tier) {
      return { error: "Wybierz próg składki." };
    }
    // Płatność włączona, ale brak skonfigurowanego Stripe → nie blokuj 500-tką.
    if (onlinePayment && !getStripe()) {
      return {
        error:
          "Płatności nie są obecnie skonfigurowane. Skontaktuj się z administratorem.",
      };
    }
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
      // Pominięcie płatności online pozostawia status „oczekuje" — administrator
      // potwierdza wpłatę (np. przelew) przy rozpatrywaniu zgłoszenia.
      paymentStatus: paid ? PaymentStatus.PENDING : PaymentStatus.NOT_REQUIRED,
      paymentTierLabel: tier?.label,
      paymentAmount: tier?.amount,
    },
  });

  // Bezpłatne członkostwo lub płatność pominięta — koniec, zgłoszenie czeka na rozpatrzenie.
  if (!onlinePayment || !tier) {
    return { ok: true };
  }

  // Płatne — utwórz sesję Stripe Checkout, zapisz link, wyślij e-mail, przekieruj.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;

  const session = await createCheckoutSession({
    amount: tier.amount,
    label: tier.label,
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
    amountText: formatPLN(tier.amount),
    paymentUrl: session.url,
  });

  redirect(session.url);
}

// Zatwierdza zgłoszenie: tworzy członka, oznacza zgłoszenie, wysyła e-mail powitalny.
// Dostęp: OWNER/BOARD danego stowarzyszenia.
export async function approveApplication(applicationId: string) {
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

  // Rola domyślna stowarzyszenia (Członek) — nadawana zatwierdzonym.
  const defaultRole = await prisma.role.findFirst({
    where: { organizationId: application.organizationId, isDefault: true },
    select: { id: true },
  });
  if (!defaultRole) throw new Error("Brak domyślnej roli w stowarzyszeniu.");

  // Transakcja: utwórz członka i oznacz zgłoszenie. unique(orgId,email) chroni
  // regułę „jeden e-mail = jeden członek" także przy wyścigu.
  await prisma.$transaction(async (tx) => {
    await tx.member.create({
      data: {
        organizationId: application.organizationId,
        roleId: defaultRole.id,
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
