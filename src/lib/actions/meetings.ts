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
import { tallyVotes, voteOutcome } from "@/lib/resolutions";
import {
  AgendaItemStatus,
  VoteChoice,
  SignatureRole,
  Prisma,
} from "@/generated/prisma/client";

export type MeetingFormState = { error?: string; ok?: boolean } | undefined;

// Odświeża wszystkie widoki, na których pojawia się spotkanie.
function revalidateMeeting(meetingId?: string) {
  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  if (meetingId) revalidatePath(`/meetings/${meetingId}`);
}

// Odświeża widoki uchwały (gdy status uchwały zmienia się przez cykl spotkania).
function revalidateResolutionViews(resolutionId: string) {
  revalidatePath("/resolutions");
  revalidatePath(`/resolutions/${resolutionId}`);
  revalidatePath(`/resolutions/${resolutionId}/dokument`);
}

// Sprawdza, że wskazany typ spotkania należy do stowarzyszenia.
async function meetingTypeBelongsToOrg(
  organizationId: string,
  meetingTypeId: string,
): Promise<boolean> {
  const type = await prisma.meetingType.findFirst({
    where: { id: meetingTypeId, organizationId },
    select: { id: true },
  });
  return type !== null;
}

// Waliduje wspólne pola spotkania (tytuł, typ, termin, forma + miejsce).
function parseMeetingFields(formData: FormData) {
  return meetingSchema.safeParse({
    title: formData.get("title"),
    meetingTypeId: formData.get("meetingTypeId"),
    startsAt: formData.get("startsAt"),
    isOnline: formData.get("locationMode") === "online",
    location: formData.get("location") ?? "",
  });
}

// Porządek obrad: równoległe pola `agendaItemIds`, `agendaItems` (po jednym na
// wiersz). Id puste = nowy punkt. Puste tytuły pomijamy (zachowując wyrównanie
// indeksów). Głosowaniu podlegają wyłącznie punkty-uchwały (dodawane osobno,
// z widoku uchwały) — ręczne punkty porządku są informacyjne.
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
    items.push({
      id: ids[i] ? ids[i] : null,
      title: result.data,
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
  const me = await requireMember(organizationId, "MEETINGS", "WRITE");

  const result = parseMeetingFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const agenda = parseAgenda(formData);
  if (!agenda.ok) return { error: agenda.error };

  if (!(await meetingTypeBelongsToOrg(organizationId, result.data.meetingTypeId))) {
    return { error: "Wybierz prawidłowy typ spotkania." };
  }

  await prisma.meeting.create({
    data: {
      organizationId,
      title: result.data.title,
      meetingTypeId: result.data.meetingTypeId,
      startsAt: result.data.startsAt,
      isOnline: result.data.isOnline,
      location: result.data.location,
      // Organizatorem jest członek, który zwołał spotkanie.
      createdById: me.id,
      agendaItems: {
        // Ręczne punkty porządku są informacyjne (nie podlegają głosowaniu) —
        // głosowalne są tylko punkty-uchwały dodawane z widoku uchwały.
        create: agenda.items.map((it, i) => ({
          order: i,
          title: it.title,
          votable: false,
        })),
      },
    },
  });

  revalidateMeeting();
  return { ok: true };
}

// Aktualizuje spotkanie (dane, porządek obrad). Wymaga MEETINGS WRITE.
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

  if (
    !(await meetingTypeBelongsToOrg(
      meeting.organizationId,
      result.data.meetingTypeId,
    ))
  ) {
    return { error: "Wybierz prawidłowy typ spotkania." };
  }

  // Istniejące punkty tego spotkania — tylko ich id wolno aktualizować.
  const existing = await prisma.agendaItem.findMany({
    where: { meetingId },
    select: { id: true, resolutionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));

  const updateOps: Prisma.AgendaItemUpdateWithWhereUniqueWithoutMeetingInput[] = [];
  const createOps: Prisma.AgendaItemCreateWithoutMeetingInput[] = [];
  agenda.items.forEach((it, i) => {
    if (it.id && existingIds.has(it.id)) {
      // Nie ruszamy `votable` ani powiązania z uchwałą — zachowujemy je dla
      // istniejących punktów (w tym punktów-uchwał, które są głosowalne).
      updateOps.push({
        where: { id: it.id },
        data: { title: it.title, order: i },
      });
    } else {
      createOps.push({ order: i, title: it.title, votable: false });
    }
  });
  const keptIds = new Set(updateOps.map((op) => op.where.id));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  // Usunięcie punktu-uchwały z porządku odpina uchwałę — wraca ona do stanu Szkic
  // (można ją potem dodać do innego spotkania). Spotkanie nie jest zakończone, więc
  // taka uchwała jest najwyżej „W głosowaniu" i nie może być podpisana.
  const resolutionIdsToReset = existing
    .filter((e) => e.resolutionId && toDelete.includes(e.id))
    .map((e) => e.resolutionId as string);

  // Porządek obrad godzimy po id; role udziału wynikają z typu spotkania.
  await prisma.$transaction([
    prisma.meeting.update({
      where: { id: meetingId },
      data: {
        title: result.data.title,
        meetingTypeId: result.data.meetingTypeId,
        startsAt: result.data.startsAt,
        isOnline: result.data.isOnline,
        location: result.data.location,
        agendaItems: {
          deleteMany: { id: { in: toDelete } },
          update: updateOps,
          create: createOps,
        },
      },
    }),
    ...(resolutionIdsToReset.length
      ? [
          prisma.resolution.updateMany({
            where: { id: { in: resolutionIdsToReset } },
            data: { status: "DRAFT", openedAt: null, decidedAt: null },
          }),
        ]
      : []),
  ]);

  revalidateMeeting(meetingId);
  resolutionIdsToReset.forEach(revalidateResolutionViews);
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
      resolutionId: true,
      _count: { select: { votes: true } },
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

  // Po oddaniu pierwszego głosu nad uchwałą nie można już cofnąć/zamknąć głosowania.
  if (
    item.resolutionId &&
    item.status === "APPROVED" &&
    status !== "APPROVED" &&
    item._count.votes > 0
  ) {
    throw new Error(
      "Nie można cofnąć głosowania — oddano już głosy nad tą uchwałą.",
    );
  }

  // Punkt-uchwała: status uchwały śledzi bramkę głosowania na spotkaniu.
  //  • zatwierdzenie punktu (APPROVED) → otwarcie głosowania (VOTING),
  //  • cofnięcie do „Do rozpatrzenia" (PENDING) → z powrotem „Oczekuje na spotkanie",
  //  • odrzucenie punktu (REJECTED) → uchwała odrzucona.
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.agendaItem.update({ where: { id: itemId }, data: { status } }),
  ];
  if (item.resolutionId) {
    const now = new Date();
    const data =
      status === "APPROVED"
        ? { status: "VOTING" as const, openedAt: now, decidedAt: null }
        : status === "REJECTED"
          ? { status: "REJECTED" as const, decidedAt: now }
          : { status: "AWAITING_MEETING" as const, openedAt: null, decidedAt: null };
    ops.push(
      prisma.resolution.update({ where: { id: item.resolutionId }, data }),
    );
  }
  await prisma.$transaction(ops);
  revalidateMeeting(item.meetingId);
  if (item.resolutionId) revalidateResolutionViews(item.resolutionId);
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
// Zakończenie zamyka też głosowanie nad uchwałami będącymi w porządku obrad —
// każdą uchwałę w trakcie głosowania (punkt zatwierdzony) rozstrzygamy z oddanych
// głosów i progu jej typu: Przyjęta / Odrzucona.
export async function endMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      organizationId: true,
      meetingType: { select: { roles: { select: { roleId: true } } } },
      agendaItems: {
        where: { resolutionId: { not: null }, status: "APPROVED" },
        select: {
          resolutionId: true,
          votes: { select: { choice: true } },
          resolution: {
            select: { resolutionType: { select: { voteThreshold: true } } },
          },
        },
      },
    },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  await requireMember(meeting.organizationId, "MEETINGS", "WRITE");

  // Spotkania nie można zakończyć, dopóki któryś punkt porządku obrad pozostaje
  // nierozpatrzony (należy go zatwierdzić albo odrzucić).
  const pendingCount = await prisma.agendaItem.count({
    where: { meetingId, status: "PENDING" },
  });
  if (pendingCount > 0) {
    throw new Error(
      "Nie można zakończyć spotkania — najpierw rozpatrz wszystkie punkty porządku obrad (zatwierdź lub odrzuć).",
    );
  }

  // Uprawnieni do głosowania na tym spotkaniu (mianownik progu) — rola z prawem
  // głosu i dopuszczona przez typ spotkania (pusta lista ról = wszyscy członkowie).
  const allowedRoleIds = meeting.meetingType.roles.map((r) => r.roleId);
  const eligibleCount = await prisma.member.count({
    where: {
      organizationId: meeting.organizationId,
      role: { is: { canVote: true } },
      ...(allowedRoleIds.length ? { roleId: { in: allowedRoleIds } } : {}),
    },
  });

  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.meeting.update({ where: { id: meetingId }, data: { endedAt: now } }),
  ];
  const decidedResolutionIds: string[] = [];
  for (const item of meeting.agendaItems) {
    if (!item.resolutionId) continue;
    const outcome = voteOutcome(
      tallyVotes(item.votes),
      item.resolution?.resolutionType?.voteThreshold ?? null,
      eligibleCount,
    );
    ops.push(
      prisma.resolution.update({
        where: { id: item.resolutionId },
        data: { status: outcome, decidedAt: now },
      }),
    );
    decidedResolutionIds.push(item.resolutionId);
  }
  await prisma.$transaction(ops);

  revalidateMeeting(meetingId);
  decidedResolutionIds.forEach(revalidateResolutionViews);
}

// Wznawia zakończone spotkanie (czyści moment zakończenia). Tylko rola Prezes.
// Wznowienie ponownie otwiera głosowanie nad rozstrzygniętymi (a niepodpisanymi)
// uchwałami z porządku obrad — wracają do stanu „W głosowaniu".
export async function reopenMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      organizationId: true,
      agendaItems: {
        where: { resolutionId: { not: null }, status: "APPROVED" },
        select: {
          resolutionId: true,
          resolution: {
            select: {
              status: true,
              _count: { select: { signatures: true } },
            },
          },
        },
      },
    },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  const me = await requireMember(meeting.organizationId);
  if (!me.role.isOwner) {
    throw new Error("Tylko Prezes może wznowić zakończone spotkanie.");
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.meeting.update({ where: { id: meetingId }, data: { endedAt: null } }),
  ];
  const reopenedResolutionIds: string[] = [];
  for (const item of meeting.agendaItems) {
    if (!item.resolutionId || !item.resolution) continue;
    const decided =
      item.resolution.status === "PASSED" ||
      item.resolution.status === "REJECTED";
    // Podpisanej uchwały nie cofamy — pozostaje rozstrzygnięta.
    if (decided && item.resolution._count.signatures === 0) {
      ops.push(
        prisma.resolution.update({
          where: { id: item.resolutionId },
          data: { status: "VOTING", decidedAt: null },
        }),
      );
      reopenedResolutionIds.push(item.resolutionId);
    }
  }
  await prisma.$transaction(ops);

  revalidateMeeting(meetingId);
  reopenedResolutionIds.forEach(revalidateResolutionViews);
}

// ─── Podpisy pod protokołem spotkania ──────────────────────────────────────

// Składa podpis pod protokołem zakończonego spotkania w wybranej roli (tytule).
// Reguły jak przy uchwałach:
//  • podpisać można tylko zakończone spotkanie,
//  • jeden członek podpisuje dane spotkanie najwyżej raz,
//  • każdy tytuł (Przewodniczący/Protokolant) obsadzany najwyżej raz.
// Wymaga MEETINGS READ (podpisują członkowie, nie tylko zarząd).
export async function signMeeting(meetingId: string, role: SignatureRole) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizationId: true, endedAt: true },
  });
  if (!meeting) throw new Error("Spotkanie nie istnieje.");

  const me = await requireMember(meeting.organizationId, "MEETINGS", "READ");

  if (meeting.endedAt === null) {
    throw new Error("Podpisać można tylko zakończone spotkanie.");
  }

  // Czytelne komunikaty przed wstawieniem; unikaty w bazie pozostają twardym zabezpieczeniem.
  const existing = await prisma.meetingSignature.findMany({
    where: { meetingId },
    select: { memberId: true, role: true },
  });
  if (existing.some((s) => s.memberId === me.id)) {
    throw new Error("Już podpisałeś(-aś) ten protokół.");
  }
  if (existing.some((s) => s.role === role)) {
    throw new Error("Ten podpis został już złożony przez inną osobę.");
  }

  const signerName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();

  try {
    await prisma.meetingSignature.create({
      data: { meetingId, memberId: me.id, role, signerName },
    });
  } catch (e) {
    // Wyścig: unikat dopilnuje, że nie powstaną dwa podpisy tego samego członka/tytułu.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Ten podpis został już złożony.");
    }
    throw e;
  }

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

// Oddaje głos członka nad punktem (uchwałą). Głos jest ostateczny — po oddaniu
// nie można go zmienić ani wycofać. Wymaga prawa udziału.
export async function castVote(itemId: string, choice: VoteChoice) {
  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId },
    select: {
      meetingId: true,
      votable: true,
      resolutionId: true,
      status: true,
      meeting: {
        select: {
          organizationId: true,
          endedAt: true,
          meetingType: {
            select: {
              requiresQuorum: true,
              roles: { select: { roleId: true } },
            },
          },
        },
      },
    },
  });
  if (!item) throw new Error("Punkt porządku obrad nie istnieje.");

  const me = await requireMember(item.meeting.organizationId, "MEETINGS", "READ");

  // Głosowaniu podlegają wyłącznie punkty będące uchwałami. Pozostałe punkty
  // porządku obrad są informacyjne.
  if (!item.resolutionId) {
    throw new Error("Głosować można wyłącznie nad punktami będącymi uchwałami.");
  }

  if (item.meeting.endedAt !== null) {
    throw new Error("Spotkanie zostało zakończone — głosowanie jest zamknięte.");
  }

  // Głosowanie nad uchwałą otwiera się dopiero po zatwierdzeniu punktu przez
  // prowadzącego (status APPROVED). Wcześniej (PENDING) oraz po odrzuceniu głosów
  // nie przyjmujemy.
  if (item.status !== "APPROVED") {
    throw new Error(
      "Głosowanie otwiera się po zatwierdzeniu punktu przez prowadzącego.",
    );
  }

  // Prawo głosu: rola członka musi mieć włączone głosowanie oraz znajdować się na
  // liście uprawnionych ról (lub spotkanie otwarte dla wszystkich).
  if (!me.role.canVote) {
    throw new Error("Twoja rola nie ma prawa głosu.");
  }
  const allowed = item.meeting.meetingType.roles.map((r) => r.roleId);
  if (allowed.length > 0 && !allowed.includes(me.roleId)) {
    throw new Error("Nie masz prawa głosu w tym spotkaniu.");
  }

  // Gdy typ spotkania wymaga kworum, bez niego głosowanie jest wstrzymane. Kworum
  // liczymy tylko z członków o rolach z prawem głosu (spójnie z widokiem spotkania
  // i §17 ust. 3 statutu).
  if (item.meeting.meetingType.requiresQuorum) {
    const memberWhere: Prisma.MemberWhereInput = {
      organizationId: item.meeting.organizationId,
      role: { is: { canVote: true } },
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
  }

  // Głos jest ostateczny — po oddaniu nie można go zmienić ani wycofać.
  const existing = await prisma.agendaVote.findUnique({
    where: { agendaItemId_memberId: { agendaItemId: itemId, memberId: me.id } },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Głos został już oddany — nie można go zmienić.");
  }

  await prisma.agendaVote.create({
    data: { agendaItemId: itemId, memberId: me.id, choice },
  });
  revalidateMeeting(item.meetingId);
}
