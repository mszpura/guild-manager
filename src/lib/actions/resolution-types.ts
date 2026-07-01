"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { resolutionTypeSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

export type ResolutionTypeFormState = { error?: string; ok?: boolean } | undefined;

// Odświeża widoki zależne od konfiguracji typów uchwał.
function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/resolutions");
}

function parseFields(formData: FormData) {
  return resolutionTypeSchema.safeParse({
    name: formData.get("name"),
    voteThreshold: formData.get("voteThreshold"),
    requiresMeeting: formData.get("requiresMeeting"),
  });
}

// Dodaje typ uchwały (nazwa, próg głosów, wymóg spotkania). Wymaga SETTINGS WRITE.
export async function addResolutionType(
  organizationId: string,
  _prev: ResolutionTypeFormState,
  formData: FormData,
): Promise<ResolutionTypeFormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const result = parseFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  // Nowy typ trafia na koniec listy.
  const count = await prisma.resolutionType.count({ where: { organizationId } });

  try {
    await prisma.resolutionType.create({
      data: {
        organizationId,
        name: result.data.name,
        voteThreshold: result.data.voteThreshold,
        requiresMeeting: result.data.requiresMeeting,
        order: count,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Typ uchwały o tej nazwie już istnieje." };
    }
    throw e;
  }

  revalidate();
  return { ok: true };
}

// Aktualizuje typ uchwały. Wymaga SETTINGS WRITE.
export async function updateResolutionType(
  resolutionTypeId: string,
  _prev: ResolutionTypeFormState,
  formData: FormData,
): Promise<ResolutionTypeFormState> {
  const type = await prisma.resolutionType.findUnique({
    where: { id: resolutionTypeId },
    select: { organizationId: true },
  });
  if (!type) return { error: "Typ uchwały nie istnieje." };

  await requireMember(type.organizationId, "SETTINGS", "WRITE");

  const result = parseFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  try {
    await prisma.resolutionType.update({
      where: { id: resolutionTypeId },
      data: {
        name: result.data.name,
        voteThreshold: result.data.voteThreshold,
        requiresMeeting: result.data.requiresMeeting,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Typ uchwały o tej nazwie już istnieje." };
    }
    throw e;
  }

  revalidate();
  return { ok: true };
}

// Usuwa typ uchwały. Wymaga SETTINGS WRITE. Nie można usunąć typu przypisanego
// do istniejących uchwał (uchwała straciłaby zdefiniowany próg / tryb głosowania).
export async function deleteResolutionType(resolutionTypeId: string) {
  const type = await prisma.resolutionType.findUnique({
    where: { id: resolutionTypeId },
    select: {
      organizationId: true,
      _count: { select: { resolutions: true } },
    },
  });
  if (!type) throw new Error("Typ uchwały nie istnieje.");

  await requireMember(type.organizationId, "SETTINGS", "WRITE");

  if (type._count.resolutions > 0) {
    throw new Error("Nie można usunąć typu przypisanego do uchwał.");
  }

  await prisma.resolutionType.delete({ where: { id: resolutionTypeId } });
  revalidate();
}
