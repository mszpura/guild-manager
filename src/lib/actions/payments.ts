"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { paymentTierLabelSchema } from "@/lib/validations";
import { parsePLN } from "@/lib/money";
import { isValidFeeDueDate } from "@/lib/payments";

export type TierFormState = { error?: string; ok?: boolean } | undefined;

// Domyślna składka zakładana przy włączeniu płatnego członkostwa.
const DEFAULT_TIER = { label: "Składka podstawowa", amount: 10000 }; // 100,00 zł

// Włącza/wyłącza płatne członkostwo. OWNER/BOARD. Po włączeniu w systemie musi istnieć
// co najmniej jedna składka — jeśli żadnej nie ma, zakładamy domyślną „Składka podstawowa".
export async function setMembershipPaid(
  organizationId: string,
  paid: boolean,
) {
  await requireMember(organizationId, "SETTINGS", "WRITE");
  await prisma.organization.update({
    where: { id: organizationId },
    data: { membershipPaid: paid },
  });

  if (paid) {
    const count = await prisma.paymentTier.count({ where: { organizationId } });
    if (count === 0) {
      await prisma.paymentTier.create({
        data: { organizationId, ...DEFAULT_TIER, order: 1 },
      });
    }
  }

  revalidatePath("/settings");
  revalidatePath("/payments");
}

// Ustawia (lub czyści) roczny termin opłacenia składki. OWNER/BOARD.
export async function setFeeDueDate(
  organizationId: string,
  _prev: TierFormState,
  formData: FormData,
): Promise<TierFormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const monthRaw = String(formData.get("feeDueMonth") ?? "").trim();
  const dayRaw = String(formData.get("feeDueDay") ?? "").trim();

  // Oba puste → wyczyść termin.
  if (monthRaw === "" && dayRaw === "") {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { feeDueMonth: null, feeDueDay: null },
    });
    revalidatePath("/settings");
    return { ok: true };
  }

  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!isValidFeeDueDate(month, day)) {
    return { error: "Podaj poprawny termin — dzień i miesiąc." };
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { feeDueMonth: month, feeDueDay: day },
  });
  revalidatePath("/settings");
  return { ok: true };
}

// Dodaje próg składki. OWNER/BOARD.
export async function addPaymentTier(
  organizationId: string,
  _prev: TierFormState,
  formData: FormData,
): Promise<TierFormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const labelResult = paymentTierLabelSchema.safeParse(formData.get("label"));
  if (!labelResult.success) {
    return { error: labelResult.error.issues[0]?.message ?? "Nieprawidłowa nazwa." };
  }

  const amount = parsePLN(String(formData.get("amount") ?? ""));
  if (amount === null) {
    return { error: "Podaj poprawną kwotę (np. 100 lub 100,50)." };
  }

  const last = await prisma.paymentTier.findFirst({
    where: { organizationId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.paymentTier.create({
    data: {
      organizationId,
      label: labelResult.data,
      amount,
      order: (last?.order ?? 0) + 1,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/payments");
  return { ok: true };
}

// Usuwa próg składki. OWNER/BOARD (organizacja ustalana z progu). W systemie musi
// pozostać co najmniej jedna składka — ostatniej nie można usunąć.
export async function deletePaymentTier(tierId: string) {
  const tier = await prisma.paymentTier.findUnique({
    where: { id: tierId },
    select: { organizationId: true },
  });
  if (!tier) throw new Error("Próg nie istnieje.");

  await requireMember(tier.organizationId, "SETTINGS", "WRITE");

  const count = await prisma.paymentTier.count({
    where: { organizationId: tier.organizationId },
  });
  if (count <= 1) {
    throw new Error("Musi pozostać co najmniej jedna składka.");
  }

  await prisma.paymentTier.delete({ where: { id: tierId } });
  revalidatePath("/settings");
  revalidatePath("/payments");
}
