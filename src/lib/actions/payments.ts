"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { paymentTierLabelSchema } from "@/lib/validations";
import { parsePLN } from "@/lib/money";
import { Role } from "@/generated/prisma/client";

export type TierFormState = { error?: string; ok?: boolean } | undefined;

// Włącza/wyłącza płatne członkostwo. OWNER/BOARD.
export async function setMembershipPaid(
  organizationId: string,
  paid: boolean,
) {
  await requireMember(organizationId, [Role.OWNER, Role.BOARD]);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { membershipPaid: paid },
  });
  revalidatePath("/settings");
}

// Dodaje próg składki. OWNER/BOARD.
export async function addPaymentTier(
  organizationId: string,
  _prev: TierFormState,
  formData: FormData,
): Promise<TierFormState> {
  await requireMember(organizationId, [Role.OWNER, Role.BOARD]);

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
  return { ok: true };
}

// Usuwa próg składki. OWNER/BOARD (organizacja ustalana z progu).
export async function deletePaymentTier(tierId: string) {
  const tier = await prisma.paymentTier.findUnique({
    where: { id: tierId },
    select: { organizationId: true },
  });
  if (!tier) throw new Error("Próg nie istnieje.");

  await requireMember(tier.organizationId, [Role.OWNER, Role.BOARD]);

  await prisma.paymentTier.delete({ where: { id: tierId } });
  revalidatePath("/settings");
}
