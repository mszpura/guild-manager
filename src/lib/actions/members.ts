"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";

// Zmienia rolę członka. Wymaga MEMBERS WRITE. Nie pozwala odebrać roli
// ostatniemu właścicielowi (ochrona przed utratą pełnego dostępu).
export async function setMemberRole(memberId: string, roleId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { organizationId: true, role: { select: { isOwner: true } } },
  });
  if (!member) throw new Error("Członek nie istnieje.");

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  // Docelowa rola musi należeć do tego samego stowarzyszenia.
  const targetRole = await prisma.role.findFirst({
    where: { id: roleId, organizationId: member.organizationId },
    select: { isOwner: true },
  });
  if (!targetRole) throw new Error("Nieprawidłowa rola.");

  // Ochrona: nie można odebrać roli właściciela ostatniemu właścicielowi.
  if (member.role.isOwner && !targetRole.isOwner) {
    const owners = await prisma.member.count({
      where: { organizationId: member.organizationId, role: { isOwner: true } },
    });
    if (owners <= 1) {
      throw new Error(
        "Nie można odebrać roli ostatniemu właścicielowi stowarzyszenia.",
      );
    }
  }

  await prisma.member.update({ where: { id: memberId }, data: { roleId } });
  revalidatePath("/members");
}
