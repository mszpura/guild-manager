"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { parsePLN } from "@/lib/money";
import { isValidFeeDueDate } from "@/lib/payments";

export type TierFormState = { error?: string; ok?: boolean } | undefined;

// Włącza/wyłącza płatne członkostwo. OWNER/BOARD. Wysokość składek ustala się per rola
// w ustawieniach składek (domyślnie każda rola jest zwolniona — Role.feeAmount = null).
export async function setMembershipPaid(
  organizationId: string,
  paid: boolean,
) {
  await requireMember(organizationId, "SETTINGS", "WRITE");
  await prisma.organization.update({
    where: { id: organizationId },
    data: { membershipPaid: paid },
  });

  revalidatePath("/settings");
  revalidatePath("/payments");
}

// Ustawia roczną składkę dla roli (w złotówkach) albo zwalnia rolę ze składek
// (pusta wartość → feeAmount = null). OWNER/BOARD. Rola musi należeć do organizacji.
export async function setRoleFee(
  roleId: string,
  amountText: string,
): Promise<{ error: string } | { ok: true }> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { organizationId: true },
  });
  if (!role) return { error: "Rola nie istnieje." };

  await requireMember(role.organizationId, "SETTINGS", "WRITE");

  const trimmed = amountText.trim();
  let feeAmount: number | null = null;
  if (trimmed !== "") {
    const amount = parsePLN(trimmed);
    if (amount === null) {
      return { error: "Podaj poprawną kwotę (np. 100 lub 100,50)." };
    }
    feeAmount = amount;
  }

  await prisma.role.update({ where: { id: roleId }, data: { feeAmount } });

  revalidatePath("/settings");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
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
