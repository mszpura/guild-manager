"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { meetingTypeSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

export type MeetingTypeFormState = { error?: string; ok?: boolean } | undefined;

// Odświeża widoki zależne od konfiguracji typów spotkań.
function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/meetings");
  revalidatePath("/dashboard");
}

// Wyciąga z formularza prawidłowe id ról należących do stowarzyszenia.
// Pole `roleIds` (wielokrotne, checkboxy). Pusta lista = otwarte dla wszystkich.
async function parseRoleIds(
  organizationId: string,
  formData: FormData,
): Promise<string[]> {
  const submitted = formData.getAll("roleIds").map(String).filter(Boolean);
  if (submitted.length === 0) return [];

  const roles = await prisma.role.findMany({
    where: { organizationId, id: { in: submitted } },
    select: { id: true },
  });
  return roles.map((r) => r.id);
}

// Dodaje typ spotkania (nazwa, role udziału, wymóg kworum). Wymaga SETTINGS WRITE.
export async function addMeetingType(
  organizationId: string,
  _prev: MeetingTypeFormState,
  formData: FormData,
): Promise<MeetingTypeFormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const result = meetingTypeSchema.safeParse({
    name: formData.get("name"),
    requiresQuorum: formData.get("requiresQuorum"),
  });
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const roleIds = await parseRoleIds(organizationId, formData);

  // Nowy typ trafia na koniec listy.
  const count = await prisma.meetingType.count({ where: { organizationId } });

  try {
    await prisma.meetingType.create({
      data: {
        organizationId,
        name: result.data.name,
        requiresQuorum: result.data.requiresQuorum,
        order: count,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Typ spotkania o tej nazwie już istnieje." };
    }
    throw e;
  }

  revalidate();
  return { ok: true };
}

// Aktualizuje typ spotkania (nazwa, role udziału, wymóg kworum). Wymaga SETTINGS WRITE.
export async function updateMeetingType(
  meetingTypeId: string,
  _prev: MeetingTypeFormState,
  formData: FormData,
): Promise<MeetingTypeFormState> {
  const type = await prisma.meetingType.findUnique({
    where: { id: meetingTypeId },
    select: { organizationId: true },
  });
  if (!type) return { error: "Typ spotkania nie istnieje." };

  await requireMember(type.organizationId, "SETTINGS", "WRITE");

  const result = meetingTypeSchema.safeParse({
    name: formData.get("name"),
    requiresQuorum: formData.get("requiresQuorum"),
  });
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const roleIds = await parseRoleIds(type.organizationId, formData);

  // Listę ról zastępujemy w całości.
  try {
    await prisma.meetingType.update({
      where: { id: meetingTypeId },
      data: {
        name: result.data.name,
        requiresQuorum: result.data.requiresQuorum,
        roles: {
          deleteMany: {},
          create: roleIds.map((roleId) => ({ roleId })),
        },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Typ spotkania o tej nazwie już istnieje." };
    }
    throw e;
  }

  revalidate();
  return { ok: true };
}

// Usuwa typ spotkania. Wymaga SETTINGS WRITE. Nie można usunąć typu używanego
// przez istniejące spotkania.
export async function deleteMeetingType(meetingTypeId: string) {
  const type = await prisma.meetingType.findUnique({
    where: { id: meetingTypeId },
    select: {
      organizationId: true,
      _count: { select: { meetings: true } },
    },
  });
  if (!type) throw new Error("Typ spotkania nie istnieje.");

  await requireMember(type.organizationId, "SETTINGS", "WRITE");

  if (type._count.meetings > 0) {
    throw new Error("Nie można usunąć typu przypisanego do spotkań.");
  }

  await prisma.meetingType.delete({ where: { id: meetingTypeId } });
  revalidate();
}
