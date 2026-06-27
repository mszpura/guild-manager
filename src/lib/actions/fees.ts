"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";

// Oznacza składkę członka za dany rok jako opłaconą (paid=true) lub cofa to
// oznaczenie (paid=false). Wymaga MEMBERS WRITE — operacyjne zarządzanie składkami
// prowadzi skarbnik/zarząd. Organizacja ustalana z wpisu członka (tenant-scoped).
export async function setFeePaid(memberId: string, year: number, paid: boolean) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { organizationId: true },
  });
  if (!member) throw new Error("Członek nie istnieje.");

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  if (!Number.isInteger(year)) throw new Error("Nieprawidłowy rok.");

  if (paid) {
    await prisma.membershipFee.upsert({
      where: { memberId_year: { memberId, year } },
      create: { organizationId: member.organizationId, memberId, year },
      update: {},
    });
  } else {
    await prisma.membershipFee.deleteMany({ where: { memberId, year } });
  }

  revalidatePath("/payments");
}
