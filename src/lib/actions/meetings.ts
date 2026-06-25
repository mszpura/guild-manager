"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import {
  meetingSchema,
  agendaItemSchema,
  agendaCommentSchema,
} from "@/lib/validations";
import { can } from "@/lib/permissions";
import { hasQuorum } from "@/lib/meetings";
import {
  AgendaItemStatus,
  VoteChoice,
  Prisma,
} from "@/generated/prisma/client";

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

// Porządek obrad: równoległe pola `agendaItemIds`, `agendaItems`, `agendaItemVotable`
// (po jednym na wiersz). Id puste = nowy punkt. Puste tytuły pomijamy (zachowując
// wyrównanie indeksów). `agendaItemVotable` jest polem ukrytym ("1"/"0"), więc każdy
// wiersz wnosi dokładnie jedną wartość — indeksy pozostają wyrównane.
type AgendaInput = { id: string | null; title: string; votable: boolean };
function parseAgenda(
  formData: FormData,
): { ok: true; items: AgendaInput[] } | { ok: false; error: string } {
  const ids = formData.getAll("agendaItemIds").map(String);
  const titles = formData.getAll("agendaItems").map(String);
  const votable = formData.getAll("agendaItemVotable").map(String);
  const items: AgendaInput[] = [];
  for (let i = 0; i < titles.length; i++) {
    const result = agendaItemSchema.safeParse(titles[i]);
    if (!result.success) {
      return { ok: false, error: result.error.issues[0]?.message ?? "Nieprawidłowy punkt." };
    }
    if (result.data === "") continue; // pusty punkt — pomijamy
    items.push({
      id: ids[i] ? ids[i] : null,
      title: result.data,
      votable: votable[i] !== "0",
    });
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
        create: agenda.items.map((it, i) => ({
          order: i,
          title: it.title,
          votable: it.votable,
        })),
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
    select: { organizationId: true, endedAt: true },
  });
  if (!meeting) return { error: "Spotkanie nie istnieje." };

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  if (meeting.endedAt !== null) {
    return { error: "Zakończonego spotkania nie można edytować." };
  }

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
      updateOps.push({
        where: { id: it.id },
        data: { title: it.title, order: i, votable: it.votable },
      });
    } else {
      createOps.push({ order: i, title: it.title, votable: it.votable });
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
    select: {
      meetingId: true,
      status: true,
      meeting: { select: { organizationId: true, endedAt: true } },
    },
  });
  if (!item) throw new Error("Punkt porządku obrad nie istnieje.");

  await requireMember(item.meeting.organizationId, "MEETINGS", "WRITE");

  // Po zakończeniu spotkania nie wolno cofać zatwierdzenia punktu.
  if (
    item.meeting.endedAt !== null &&
    item.status === "APPROVED" &&
    status !== "APPROVED"
  ) {
    throw new Error(
      "Nie można cofnąć zatwierdzenia punktu po zakończeniu spotkania.",
    );
  }

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
    select: { organizationId: true, endedAt: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  if (meeting.endedAt !== null) {
    throw new Error("Spotkanie zostało zakończone — lista obecności jest zamknięta.");
  }

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

// Wznawia zakończone spotkanie (czyści moment zakończenia). Tylko rola Właściciel.
export async function reopenMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  const me = await requireMember(meeting.organizationId);
  if (!me.role.isOwner) {
    throw new Error("Tylko Właściciel może wznowić zakończone spotkanie.");
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { endedAt: null },
  });
  revalidateMeeting(meetingId);
}

// ─── Komentarze do punktów porządku obrad ─────────────────────────────────

// Dodaje komentarz do punktu. Autorem jest zalogowany członek. Wymaga MEETINGS READ.
export async function addAgendaComment(itemId: string, text: string) {
  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId },
    select: { meetingId: true, meeting: { select: { organizationId: true } } },
  });
  if (!item) throw new Error("Punkt porządku obrad nie istnieje.");

  const me = await requireMember(item.meeting.organizationId, "MEETINGS", "READ");

  const result = agendaCommentSchema.safeParse(text);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Nieprawidłowy komentarz.");
  }

  await prisma.agendaComment.create({
    data: { agendaItemId: itemId, authorId: me.id, text: result.data },
  });
  revalidateMeeting(item.meetingId);
}

// Usuwa komentarz. Może autor lub osoba z MEETINGS WRITE.
export async function deleteAgendaComment(commentId: string) {
  const comment = await prisma.agendaComment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      agendaItem: {
        select: { meetingId: true, meeting: { select: { organizationId: true } } },
      },
    },
  });
  if (!comment) throw new Error("Komentarz nie istnieje.");

  const me = await requireMember(
    comment.agendaItem.meeting.organizationId,
    "MEETINGS",
    "READ",
  );
  if (comment.authorId !== me.id && !can(me.role, "MEETINGS", "WRITE")) {
    throw new Error("Brak uprawnień do usunięcia tego komentarza.");
  }

  await prisma.agendaComment.delete({ where: { id: commentId } });
  revalidateMeeting(comment.agendaItem.meetingId);
}

// ─── Głosowanie nad punktami porządku obrad ───────────────────────────────

// Oddaje (lub zmienia/cofa) głos członka nad punktem. Wymaga prawa udziału.
// Ponowny wybór tej samej opcji = wycofanie głosu.
export async function castVote(itemId: string, choice: VoteChoice) {
  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId },
    select: {
      meetingId: true,
      votable: true,
      status: true,
      meeting: {
        select: {
          organizationId: true,
          endedAt: true,
          allowedRoles: { select: { roleId: true } },
        },
      },
    },
  });
  if (!item) throw new Error("Punkt porządku obrad nie istnieje.");

  const me = await requireMember(item.meeting.organizationId, "MEETINGS", "READ");

  if (!item.votable) {
    throw new Error("Ten punkt porządku obrad nie podlega głosowaniu.");
  }

  if (item.meeting.endedAt !== null) {
    throw new Error("Spotkanie zostało zakończone — głosowanie jest zamknięte.");
  }

  if (item.status === "REJECTED") {
    throw new Error("Nie można głosować nad odrzuconym punktem.");
  }

  // Prawo głosu: rola członka na liście uprawnionych (lub spotkanie otwarte).
  const allowed = item.meeting.allowedRoles.map((r) => r.roleId);
  if (allowed.length > 0 && !allowed.includes(me.roleId)) {
    throw new Error("Nie masz prawa głosu w tym spotkaniu.");
  }

  // Bez kworum głosowanie jest wstrzymane.
  const memberWhere: Prisma.MemberWhereInput = {
    organizationId: item.meeting.organizationId,
    ...(allowed.length > 0 ? { roleId: { in: allowed } } : {}),
  };
  const [eligibleTotal, presentCount] = await Promise.all([
    prisma.member.count({ where: memberWhere }),
    prisma.meetingAttendance.count({
      where: { meetingId: item.meetingId, present: true, member: memberWhere },
    }),
  ]);
  if (!hasQuorum(presentCount, eligibleTotal)) {
    throw new Error("Brak kworum — głosowanie jest wstrzymane.");
  }

  const existing = await prisma.agendaVote.findUnique({
    where: { agendaItemId_memberId: { agendaItemId: itemId, memberId: me.id } },
    select: { choice: true },
  });

  if (existing?.choice === choice) {
    // Ten sam wybór ponownie → wycofanie głosu.
    await prisma.agendaVote.delete({
      where: { agendaItemId_memberId: { agendaItemId: itemId, memberId: me.id } },
    });
  } else {
    await prisma.agendaVote.upsert({
      where: { agendaItemId_memberId: { agendaItemId: itemId, memberId: me.id } },
      create: { agendaItemId: itemId, memberId: me.id, choice },
      update: { choice },
    });
  }
  revalidateMeeting(item.meetingId);
}
