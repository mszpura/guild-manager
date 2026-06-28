"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { applicationFieldSchema } from "@/lib/validations";
import { FormFieldMode } from "@/generated/prisma/client";

export type FieldFormState = { error?: string; ok?: boolean } | undefined;

const FORM_FIELD_MODES = Object.values(FormFieldMode) as string[];

// Zapisuje tryby pól standardowych formularza (data urodzenia / telefon / adres):
// ukryte, nieobowiązkowe albo obowiązkowe. SETTINGS WRITE.
export async function setFormFieldModes(
  organizationId: string,
  modes: { birthDate: string; phone: string; address: string },
): Promise<void> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const valid = (v: string): v is FormFieldMode => FORM_FIELD_MODES.includes(v);
  if (!valid(modes.birthDate) || !valid(modes.phone) || !valid(modes.address)) {
    throw new Error("Nieprawidłowy tryb pola.");
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      formBirthDate: modes.birthDate,
      formPhone: modes.phone,
      formAddress: modes.address,
    },
  });

  revalidatePath("/settings");
}

// Dodaje pole własne do formularza zgłoszeniowego. OWNER/BOARD.
export async function addApplicationField(
  organizationId: string,
  _prev: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const parsed = applicationFieldSchema.safeParse({
    label: formData.get("label"),
    required: formData.get("required") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  // Kolejne pole trafia na koniec listy.
  const last = await prisma.applicationField.findFirst({
    where: { organizationId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.applicationField.create({
    data: {
      organizationId,
      label: parsed.data.label,
      required: parsed.data.required,
      order: (last?.order ?? 0) + 1,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// Usuwa pole własne. OWNER/BOARD (organizacja ustalana z pola).
export async function deleteApplicationField(fieldId: string) {
  const field = await prisma.applicationField.findUnique({
    where: { id: fieldId },
    select: { organizationId: true },
  });
  if (!field) throw new Error("Pole nie istnieje.");

  await requireMember(field.organizationId, "SETTINGS", "WRITE");

  await prisma.applicationField.delete({ where: { id: fieldId } });
  revalidatePath("/settings");
}
