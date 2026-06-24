"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { meetingSchema } from "@/lib/validations";

export type MeetingFormState = { error?: string; ok?: boolean } | undefined;

// Wyciąga z formularza prawidłowe id ról należących do stowarzyszenia.
// Pole `roleIds` (wielokrotne, checkboxy). Pusta lista = otwarte dla wszystkich.
async function parseAllowedRoleIds(
  organizationId: string,
  formData: FormData,
): Promise<string[]> {
  const submitted = formData
    .getAll("roleIds")
    .map(String)
    .filter(Boolean);
  if (submitted.length === 0) return [];

  const roles = await prisma.role.findMany({
    where: { organizationId, id: { in: submitted } },
    select: { id: true },
  });
  return roles.map((r) => r.id);
}

// Waliduje wspólne pola spotkania (tytuł, typ, termin, miejsce, porządek).
function parseMeetingFields(formData: FormData) {
  return meetingSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    startsAt: formData.get("startsAt"),
    location: formData.get("location") ?? "",
    agenda: formData.get("agenda") ?? "",
  });
}

// Dodaje spotkanie. Wymaga MEETINGS WRITE.
export async function createMeeting(
  organizationId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  await requireMember(organizationId, "MEETINGS", "WRITE");

  const result = parseMeetingFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const roleIds = await parseAllowedRoleIds(organizationId, formData);

  await prisma.meeting.create({
    data: {
      organizationId,
      title: result.data.title,
      type: result.data.type,
      startsAt: result.data.startsAt,
      location: result.data.location,
      agenda: result.data.agenda,
      allowedRoles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
  });

  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Aktualizuje spotkanie (w tym listę uprawnionych ról). Wymaga MEETINGS WRITE.
export async function updateMeeting(
  meetingId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true },
  });
  if (!meeting) return { error: "Spotkanie nie istnieje." };

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  const result = parseMeetingFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const roleIds = await parseAllowedRoleIds(meeting.organizationId, formData);

  // Listę ról zastępujemy w całości (usuń wszystkie, dodaj wybrane).
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      title: result.data.title,
      type: result.data.type,
      startsAt: result.data.startsAt,
      location: result.data.location,
      agenda: result.data.agenda,
      allowedRoles: {
        deleteMany: {},
        create: roleIds.map((roleId) => ({ roleId })),
      },
    },
  });

  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Usuwa spotkanie. Wymaga MEETINGS WRITE.
export async function deleteMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  await prisma.meeting.delete({ where: { id: meetingId } });
  revalidatePath("/meetings");
  revalidatePath("/dashboard");
}
