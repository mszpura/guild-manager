"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";

// Oznacza składkę członka za dany rok jako opłaconą (paid=true) lub cofa to
// oznaczenie (paid=false). Wymaga MEMBERS WRITE — operacyjne zarządzanie składkami
// prowadzi skarbnik/zarząd. Organizacja ustalana z wpisu członka (tenant-scoped).
// Przy oznaczaniu zapisujemy migawkę kwoty z przypisanego progu na potrzeby statystyk.
export async function setFeePaid(memberId: string, year: number, paid: boolean) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      organizationId: true,
      paymentTier: { select: { amount: true } },
    },
  });
  if (!member) throw new Error("Członek nie istnieje.");

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  if (!Number.isInteger(year)) throw new Error("Nieprawidłowy rok.");

  if (paid) {
    const amount = member.paymentTier?.amount ?? null;
    await prisma.membershipFee.upsert({
      where: { memberId_year: { memberId, year } },
      create: { organizationId: member.organizationId, memberId, year, amount },
      update: { amount },
    });
  } else {
    await prisma.membershipFee.deleteMany({ where: { memberId, year } });
  }

  revalidatePath("/payments");
}

// Przypisuje członkowi próg składki (lub czyści przypisanie, gdy tierId puste).
// Wymaga MEMBERS WRITE. Próg musi należeć do tego samego stowarzyszenia.
export async function setMemberTier(memberId: string, tierId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { organizationId: true },
  });
  if (!member) throw new Error("Członek nie istnieje.");

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  let nextTierId: string | null = null;
  if (tierId) {
    const tier = await prisma.paymentTier.findUnique({
      where: { id: tierId },
      select: { organizationId: true },
    });
    if (!tier || tier.organizationId !== member.organizationId) {
      throw new Error("Nieprawidłowa składka.");
    }
    nextTierId = tierId;
  }

  await prisma.member.update({
    where: { id: memberId },
    data: { paymentTierId: nextTierId },
  });
  revalidatePath("/payments");
}
