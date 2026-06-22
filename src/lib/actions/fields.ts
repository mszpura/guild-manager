"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { applicationFieldSchema } from "@/lib/validations";
import { Role } from "@/generated/prisma/client";

export type FieldFormState = { error?: string; ok?: boolean } | undefined;

// Dodaje pole własne do formularza zgłoszeniowego. OWNER/BOARD.
export async function addApplicationField(
  organizationId: string,
  _prev: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  await requireMember(organizationId, [Role.OWNER, Role.BOARD]);

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

  await requireMember(field.organizationId, [Role.OWNER, Role.BOARD]);

  await prisma.applicationField.delete({ where: { id: fieldId } });
  revalidatePath("/settings");
}
