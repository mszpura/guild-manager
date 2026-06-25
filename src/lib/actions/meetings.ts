"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { meetingSchema, agendaItemSchema } from "@/lib/validations";
import { AgendaItemStatus, Prisma } from "@/generated/prisma/client";

export type MeetingFormState = { error?: string; ok?: boolean } | undefined;

// Odświeża wszystkie widoki, na których pojawia się spotkanie.
function revalidateMeeting(meetingId?: string) {
  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  if (meetingId) revalidatePath(`/meetings/${meetingId}`);
}

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

// Waliduje wspólne pola spotkania (tytuł, typ, termin, miejsce).
function parseMeetingFields(formData: FormData) {
  return meetingSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    startsAt: formData.get("startsAt"),
    location: formData.get("location") ?? "",
  });
}

// Porządek obrad: równoległe pola `agendaItemIds` i `agendaItems` (po wierszu).
// Id puste = nowy punkt. Puste tytuły pomijamy (zachowując wyrównanie indeksów).
type AgendaInput = { id: string | null; title: string };
function parseAgenda(
  formData: FormData,
): { ok: true; items: AgendaInput[] } | { ok: false; error: string } {
  const ids = formData.getAll("agendaItemIds").map(String);
  const titles = formData.getAll("agendaItems").map(String);
  const items: AgendaInput[] = [];
  for (let i = 0; i < titles.length; i++) {
    const result = agendaItemSchema.safeParse(titles[i]);
    if (!result.success) {
      return { ok: false, error: result.error.issues[0]?.message ?? "Nieprawidłowy punkt." };
    }
    if (result.data === "") continue; // pusty punkt — pomijamy
    items.push({ id: ids[i] ? ids[i] : null, title: result.data });
  }
  return { ok: true, items };
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

  const agenda = parseAgenda(formData);
  if (!agenda.ok) return { error: agenda.error };

  const roleIds = await parseAllowedRoleIds(organizationId, formData);

  await prisma.meeting.create({
    data: {
      organizationId,
      title: result.data.title,
      type: result.data.type,
      startsAt: result.data.startsAt,
      location: result.data.location,
      allowedRoles: { create: roleIds.map((roleId) => ({ roleId })) },
      agendaItems: {
        create: agenda.items.map((it, i) => ({ order: i, title: it.title })),
      },
    },
  });

  revalidateMeeting();
  return { ok: true };
}

// Aktualizuje spotkanie (dane, role, porządek obrad). Wymaga MEETINGS WRITE.
// Punkty porządku godzimy po id — status istniejących punktów zostaje zachowany.
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

  const agenda = parseAgenda(formData);
  if (!agenda.ok) return { error: agenda.error };

  const roleIds = await parseAllowedRoleIds(meeting.organizationId, formData);

  // Istniejące punkty tego spotkania — tylko ich id wolno aktualizować.
  const existing = await prisma.agendaItem.findMany({
    where: { meetingId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));

  const updateOps: Prisma.AgendaItemUpdateWithWhereUniqueWithoutMeetingInput[] = [];
  const createOps: Prisma.AgendaItemCreateWithoutMeetingInput[] = [];
  agenda.items.forEach((it, i) => {
    if (it.id && existingIds.has(it.id)) {
      updateOps.push({ where: { id: it.id }, data: { title: it.title, order: i } });
    } else {
      createOps.push({ order: i, title: it.title });
    }
  });
  const keptIds = new Set(updateOps.map((op) => op.where.id));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  // Listę ról zastępujemy w całości; porządek obrad godzimy po id.
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      title: result.data.title,
      type: result.data.type,
      startsAt: result.data.startsAt,
      location: result.data.location,
      allowedRoles: {
        deleteMany: {},
        create: roleIds.map((roleId) => ({ roleId })),
      },
      agendaItems: {
        deleteMany: { id: { in: toDelete } },
        update: updateOps,
        create: createOps,
      },
    },
  });

  revalidateMeeting(meetingId);
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
  revalidateMeeting();
}

// ─── Akcje widoku spotkania ──────────────────────────────────────────────

// Zmienia status punktu porządku obrad (zatwierdź / odrzuć / cofnij). MEETINGS WRITE.
export async function decideAgendaItem(
  itemId: string,
  status: AgendaItemStatus,
) {
  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId },
    select: { meetingId: true, meeting: { select: { organizationId: true } } },
  });
  if (!item) throw new Error("Punkt porządku obrad nie istnieje.");

  await requireMember(item.meeting.organizationId, "MEETINGS", "WRITE");

  await prisma.agendaItem.update({ where: { id: itemId }, data: { status } });
  revalidateMeeting(item.meetingId);
}

// Odnotowuje obecność / nieobecność członka na spotkaniu. MEETINGS WRITE.
export async function setAttendance(
  meetingId: string,
  memberId: string,
  present: boolean,
) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  // Członek musi należeć do tego samego stowarzyszenia.
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId: meeting.organizationId },
    select: { id: true },
  });
  if (!member) throw new Error("Nieprawidłowy członek.");

  await prisma.meetingAttendance.upsert({
    where: { meetingId_memberId: { meetingId, memberId } },
    create: { meetingId, memberId, present },
    update: { present },
  });
  revalidateMeeting(meetingId);
}

// Zamyka spotkanie (zapisuje moment zakończenia). MEETINGS WRITE.
export async function endMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { endedAt: new Date() },
  });
  revalidateMeeting(meetingId);
}

// Wznawia zakończone spotkanie (czyści moment zakończenia). MEETINGS WRITE.
export async function reopenMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { endedAt: null },
  });
  revalidateMeeting(meetingId);
}
