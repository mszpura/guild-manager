"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { resolutionSchema } from "@/lib/validations";
import { tallyVotes, voteOutcome } from "@/lib/resolutions";
import { can } from "@/lib/permissions";
import { Prisma, VoteChoice, SignatureRole } from "@/generated/prisma/client";

// Liczba uprawnionych do głosowania online nad uchwałami: członkowie z dostępem do
// Uchwał (co najmniej odczyt — READ lub WRITE) i rolą z prawem głosu (mianownik
// progu i paska frekwencji). Spójne z regułą oddawania głosu w castResolutionVote.
async function eligibleResolutionVoterCount(
  organizationId: string,
): Promise<number> {
  const members = await prisma.member.findMany({
    where: { organizationId },
    select: { role: { select: { isOwner: true, permissions: true, canVote: true } } },
  });
  return members.filter(
    (m) => can(m.role, "RESOLUTIONS", "READ") && m.role.canVote,
  ).length;
}

export type ResolutionFormState = { error?: string; ok?: boolean } | undefined;

function revalidateResolution(resolutionId?: string) {
  revalidatePath("/resolutions");
  revalidatePath("/dashboard");
  if (resolutionId) {
    revalidatePath(`/resolutions/${resolutionId}`);
    revalidatePath(`/resolutions/${resolutionId}/dokument`);
  }
}

function parseFields(formData: FormData) {
  return resolutionSchema.safeParse({
    number: formData.get("number"),
    title: formData.get("title"),
    content: formData.get("content") ?? "",
    secretBallot: formData.get("ballot") ?? "open",
    resolutionTypeId: formData.get("resolutionTypeId") ?? "",
  });
}

// Sprawdza, że wybrany typ uchwały należy do stowarzyszenia. Zwraca jego id albo
// null (brak wyboru). Rzuca, gdy podano obcy/nieistniejący typ.
async function resolveTypeId(
  organizationId: string,
  resolutionTypeId: string | null,
): Promise<string | null> {
  if (!resolutionTypeId) return null;
  const type = await prisma.resolutionType.findFirst({
    where: { id: resolutionTypeId, organizationId },
    select: { id: true },
  });
  return type?.id ?? null;
}

// Tworzy uchwałę (w stanie Szkic). Wymaga RESOLUTIONS WRITE.
export async function createResolution(
  organizationId: string,
  _prev: ResolutionFormState,
  formData: FormData,
): Promise<ResolutionFormState> {
  await requireMember(organizationId, "RESOLUTIONS", "WRITE");

  const result = parseFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const resolutionTypeId = await resolveTypeId(
    organizationId,
    result.data.resolutionTypeId,
  );

  try {
    await prisma.resolution.create({
      data: {
        organizationId,
        number: result.data.number,
        title: result.data.title,
        content: result.data.content,
        secretBallot: result.data.secretBallot,
        resolutionTypeId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Uchwała o tym numerze już istnieje." };
    }
    throw e;
  }

  revalidateResolution();
  return { ok: true };
}

// Aktualizuje uchwałę. Edycja dozwolona tylko w stanie Szkic. RESOLUTIONS WRITE.
export async function updateResolution(
  resolutionId: string,
  _prev: ResolutionFormState,
  formData: FormData,
): Promise<ResolutionFormState> {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: { organizationId: true, status: true },
  });
  if (!resolution) return { error: "Uchwała nie istnieje." };

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status !== "DRAFT") {
    return { error: "Edytować można tylko uchwałę w stanie szkicu." };
  }

  const result = parseFields(formData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  const resolutionTypeId = await resolveTypeId(
    resolution.organizationId,
    result.data.resolutionTypeId,
  );

  try {
    await prisma.resolution.update({
      where: { id: resolutionId },
      data: {
        number: result.data.number,
        title: result.data.title,
        content: result.data.content,
        secretBallot: result.data.secretBallot,
        resolutionTypeId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Uchwała o tym numerze już istnieje." };
    }
    throw e;
  }

  revalidateResolution(resolutionId);
  return { ok: true };
}

// Usuwa uchwałę. Wymaga RESOLUTIONS WRITE.
export async function deleteResolution(resolutionId: string) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: { organizationId: true },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  await prisma.resolution.delete({ where: { id: resolutionId } });
  revalidateResolution();
}

// Otwiera głosowanie nad uchwałą (Szkic → W głosowaniu). RESOLUTIONS WRITE.
export async function openResolutionVoting(resolutionId: string) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: {
      organizationId: true,
      status: true,
      resolutionType: { select: { requiresMeeting: true } },
    },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status !== "DRAFT") {
    throw new Error("Głosowanie można otworzyć tylko dla szkicu.");
  }

  // Typ wymagający głosowania na spotkaniu nie obsługuje na razie głosowania online.
  if (resolution.resolutionType?.requiresMeeting) {
    throw new Error(
      "Ten typ uchwały wymaga głosowania na spotkaniu — głosowanie online jest wyłączone.",
    );
  }

  await prisma.resolution.update({
    where: { id: resolutionId },
    data: { status: "VOTING", openedAt: new Date() },
  });
  revalidateResolution(resolutionId);
}

// Zamyka głosowanie i wyznacza wynik z oddanych głosów. RESOLUTIONS WRITE.
export async function closeResolutionVoting(resolutionId: string) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: {
      organizationId: true,
      status: true,
      votes: { select: { choice: true } },
      resolutionType: { select: { voteThreshold: true } },
    },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status !== "VOTING") {
    throw new Error("Zamknąć można tylko trwające głosowanie.");
  }

  // Próg z typu uchwały liczony względem liczby uprawnionych (brak typu → większość).
  const eligibleCount = await eligibleResolutionVoterCount(
    resolution.organizationId,
  );
  const outcome = voteOutcome(
    tallyVotes(resolution.votes),
    resolution.resolutionType?.voteThreshold ?? null,
    eligibleCount,
  );
  await prisma.resolution.update({
    where: { id: resolutionId },
    // Zamrażamy liczbę uprawnionych z chwili rozstrzygnięcia — to ona jest odtąd
    // mianownikiem pasków wyniku (późniejsze zmiany członkostwa jej nie ruszą).
    data: {
      status: outcome,
      decidedAt: new Date(),
      decidedEligibleCount: eligibleCount,
    },
  });
  revalidateResolution(resolutionId);
}

// Cofa uchwałę do szkicu (czyści głosy i znaczniki czasu). RESOLUTIONS WRITE.
export async function reopenResolutionDraft(resolutionId: string) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: {
      organizationId: true,
      status: true,
      _count: { select: { signatures: true } },
    },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status === "DRAFT") return;

  // Podpisana uchwała jest zamknięta — cofnięcie do szkicu skasowałoby podpisy.
  if (resolution._count.signatures > 0) {
    throw new Error("Nie można cofnąć do szkicu — uchwała została podpisana.");
  }

  await prisma.$transaction([
    prisma.resolutionVote.deleteMany({ where: { resolutionId } }),
    prisma.resolution.update({
      where: { id: resolutionId },
      data: {
        status: "DRAFT",
        openedAt: null,
        decidedAt: null,
        decidedEligibleCount: null,
      },
    }),
  ]);
  revalidateResolution(resolutionId);
}

// Oddaje głos członka nad uchwałą w trakcie głosowania. Głos jest ostateczny —
// po oddaniu nie można go zmienić ani wycofać. Wymaga RESOLUTIONS READ.
export async function castResolutionVote(
  resolutionId: string,
  choice: VoteChoice,
) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: {
      organizationId: true,
      status: true,
      resolutionType: { select: { requiresMeeting: true } },
    },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  const me = await requireMember(resolution.organizationId, "RESOLUTIONS", "READ");

  if (!me.role.canVote) {
    throw new Error("Twoja rola nie ma prawa głosu.");
  }

  // Typ wymagający głosowania na spotkaniu nie obsługuje na razie głosowania online.
  if (resolution.resolutionType?.requiresMeeting) {
    throw new Error(
      "Ten typ uchwały wymaga głosowania na spotkaniu — głosowanie online jest wyłączone.",
    );
  }

  if (resolution.status !== "VOTING") {
    throw new Error("Głosowanie nad tą uchwałą nie jest otwarte.");
  }

  // Głos jest ostateczny — po oddaniu nie można go zmienić ani wycofać.
  const existing = await prisma.resolutionVote.findUnique({
    where: { resolutionId_memberId: { resolutionId, memberId: me.id } },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Głos został już oddany — nie można go zmienić.");
  }

  await prisma.resolutionVote.create({
    data: { resolutionId, memberId: me.id, choice },
  });
  revalidateResolution(resolutionId);
}

// Składa podpis pod zatwierdzoną uchwałą w wybranej roli (tytule). Reguły:
//  • podpisać można tylko uchwałę przyjętą (PASSED),
//  • jeden członek podpisuje daną uchwałę najwyżej raz,
//  • każdy tytuł (Przewodniczący/Protokolant) obsadzany najwyżej raz.
// Wymaga RESOLUTIONS READ (podpisują członkowie, nie tylko zarząd).
export async function signResolution(
  resolutionId: string,
  role: SignatureRole,
) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: { organizationId: true, status: true },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  const me = await requireMember(resolution.organizationId, "RESOLUTIONS", "READ");

  if (resolution.status !== "PASSED") {
    throw new Error("Podpisać można tylko zatwierdzoną uchwałę.");
  }

  // Czytelne komunikaty przed wstawieniem; unikaty w bazie pozostają twardym zabezpieczeniem.
  const existing = await prisma.resolutionSignature.findMany({
    where: { resolutionId },
    select: { memberId: true, role: true },
  });
  if (existing.some((s) => s.memberId === me.id)) {
    throw new Error("Już podpisałeś(-aś) tę uchwałę.");
  }
  if (existing.some((s) => s.role === role)) {
    throw new Error("Ten podpis został już złożony przez inną osobę.");
  }

  const signerName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();

  try {
    await prisma.resolutionSignature.create({
      data: { resolutionId, memberId: me.id, role, signerName },
    });
  } catch (e) {
    // Wyścig: unikat dopilnuje, że nie powstaną dwa podpisy tego samego członka/tytułu.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Ten podpis został już złożony.");
    }
    throw e;
  }

  revalidateResolution(resolutionId);
}

// Dodaje uchwałę do porządku obrad wybranego spotkania jako punkt do głosowania.
// Dla typów wymagających głosowania na spotkaniu — głosowanie odbywa się wtedy na
// spotkaniu (jako punkt porządku), nie online. Wymaga RESOLUTIONS WRITE.
export async function addResolutionToMeeting(
  resolutionId: string,
  meetingId: string,
) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: {
      organizationId: true,
      number: true,
      title: true,
      content: true,
      status: true,
      resolutionType: { select: { requiresMeeting: true } },
      agendaItem: { select: { id: true } },
    },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (!resolution.resolutionType?.requiresMeeting) {
    throw new Error(
      "Do spotkania można dodać tylko uchwałę typu wymagającego głosowania na spotkaniu.",
    );
  }
  if (resolution.status !== "DRAFT") {
    throw new Error("Do spotkania można dodać tylko uchwałę w stanie szkicu.");
  }
  if (resolution.agendaItem) {
    throw new Error("Ta uchwała jest już dodana do spotkania.");
  }

  // Spotkanie musi należeć do tego samego stowarzyszenia i nie być zakończone.
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      organizationId: resolution.organizationId,
      endedAt: null,
    },
    select: { id: true },
  });
  if (!meeting) {
    throw new Error("Wybierz nadchodzące (niezakończone) spotkanie.");
  }

  // Punkt-uchwała trafia na koniec porządku obrad; jest głosowalny (votable).
  // Uchwała przechodzi w stan „Oczekuje na spotkanie".
  const count = await prisma.agendaItem.count({ where: { meetingId } });
  await prisma.$transaction([
    prisma.agendaItem.create({
      data: {
        meetingId,
        order: count,
        title: `Uchwała nr ${resolution.number}: ${resolution.title}`,
        description: resolution.content,
        votable: true,
        resolutionId,
      },
    }),
    prisma.resolution.update({
      where: { id: resolutionId },
      data: { status: "AWAITING_MEETING" },
    }),
  ]);

  revalidateResolution(resolutionId);
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meetingId}`);
}
