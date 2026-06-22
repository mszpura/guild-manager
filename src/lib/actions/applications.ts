"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/tenant";
import { applicationSchema } from "@/lib/validations";
import { sendWelcomeEmail } from "@/lib/email";
import { ApplicationStatus, Role } from "@/generated/prisma/client";

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
  const parsed = applicationSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    birthDate: formData.get("birthDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  // Stowarzyszenie identyfikowane wyłącznie przez aktywny token (tajność = dostęp).
  const org = await prisma.organization.findFirst({
    where: { inviteToken: token, inviteEnabled: true },
    select: { id: true },
  });
  if (!org) {
    return { error: "Ten link zaproszeniowy jest nieaktywny lub nieprawidłowy." };
  }

  const { firstName, lastName, email, birthDate } = parsed.data;

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

  await prisma.membershipApplication.create({
    data: { organizationId: org.id, firstName, lastName, email, birthDate },
  });

  return { ok: true };
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

  await requireMembership(application.organizationId, [Role.OWNER, Role.BOARD]);

  if (application.status !== ApplicationStatus.PENDING) {
    throw new Error("To zgłoszenie zostało już rozpatrzone.");
  }

  // Transakcja: utwórz członka i oznacz zgłoszenie. unique(orgId,email) chroni
  // regułę „jeden e-mail = jeden członek" także przy wyścigu.
  await prisma.$transaction(async (tx) => {
    await tx.member.create({
      data: {
        organizationId: application.organizationId,
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        birthDate: application.birthDate,
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

  await requireMembership(application.organizationId, [Role.OWNER, Role.BOARD]);

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
