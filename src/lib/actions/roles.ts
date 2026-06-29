"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { roleNameSchema } from "@/lib/validations";
import { parsePermissions } from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client";

export type RoleFormState = { error?: string; ok?: boolean } | undefined;

// Dodaje nową rolę z macierzą uprawnień. Wymaga SETTINGS WRITE.
export async function addRole(
  organizationId: string,
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const nameResult = roleNameSchema.safeParse(formData.get("name"));
  if (!nameResult.success) {
    return { error: nameResult.error.issues[0]?.message ?? "Nieprawidłowa nazwa." };
  }

  try {
    await prisma.role.create({
      data: {
        organizationId,
        name: nameResult.data,
        permissions: parsePermissions(formData),
        feeExempt: formData.get("feeExempt") === "on",
        canVote: formData.get("canVote") === "on",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Rola o tej nazwie już istnieje." };
    }
    throw e;
  }

  revalidatePath("/settings");
  return { ok: true };
}

// Aktualizuje uprawnienia (i nazwę dla ról niesystemowych). Wymaga SETTINGS WRITE.
export async function updateRole(
  roleId: string,
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { organizationId: true, isOwner: true, isSystem: true },
  });
  if (!role) return { error: "Rola nie istnieje." };

  await requireMember(role.organizationId, "SETTINGS", "WRITE");

  // Rola właściciela ma zawsze pełnię praw — nie wolno jej zmieniać.
  if (role.isOwner) {
    return { error: "Roli właściciela nie można edytować." };
  }

  // Nazwę zmieniamy tylko dla ról niesystemowych (Członek ma stałą nazwę).
  // Zwolnienie ze składek i prawo głosu można ustawić dla każdej roli poza właścicielską.
  const data: Prisma.RoleUpdateInput = {
    permissions: parsePermissions(formData),
    feeExempt: formData.get("feeExempt") === "on",
    canVote: formData.get("canVote") === "on",
  };
  if (!role.isSystem) {
    const nameResult = roleNameSchema.safeParse(formData.get("name"));
    if (!nameResult.success) {
      return { error: nameResult.error.issues[0]?.message ?? "Nieprawidłowa nazwa." };
    }
    data.name = nameResult.data;
  }

  try {
    await prisma.role.update({ where: { id: roleId }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Rola o tej nazwie już istnieje." };
    }
    throw e;
  }

  revalidatePath("/settings");
  return { ok: true };
}

// Usuwa rolę niestandardową. Wymaga SETTINGS WRITE.
export async function deleteRole(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { organizationId: true, isSystem: true, _count: { select: { members: true } } },
  });
  if (!role) throw new Error("Rola nie istnieje.");

  await requireMember(role.organizationId, "SETTINGS", "WRITE");

  if (role.isSystem) throw new Error("Roli systemowej nie można usunąć.");
  if (role._count.members > 0) {
    throw new Error("Nie można usunąć roli przypisanej do członków.");
  }

  await prisma.role.delete({ where: { id: roleId } });
  revalidatePath("/settings");
}
