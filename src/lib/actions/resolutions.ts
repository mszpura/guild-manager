"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/tenant";
import { resolutionSchema } from "@/lib/validations";
import { tallyVotes, voteOutcome } from "@/lib/resolutions";
import { Prisma, VoteChoice, SignatureRole } from "@/generated/prisma/client";

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
  });
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

  try {
    await prisma.resolution.create({
      data: {
        organizationId,
        number: result.data.number,
        title: result.data.title,
        content: result.data.content,
        secretBallot: result.data.secretBallot,
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

  try {
    await prisma.resolution.update({
      where: { id: resolutionId },
      data: {
        number: result.data.number,
        title: result.data.title,
        content: result.data.content,
        secretBallot: result.data.secretBallot,
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
    select: { organizationId: true, status: true },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status !== "DRAFT") {
    throw new Error("Głosowanie można otworzyć tylko dla szkicu.");
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
    },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status !== "VOTING") {
    throw new Error("Zamknąć można tylko trwające głosowanie.");
  }

  const outcome = voteOutcome(tallyVotes(resolution.votes));
  await prisma.resolution.update({
    where: { id: resolutionId },
    data: { status: outcome, decidedAt: new Date() },
  });
  revalidateResolution(resolutionId);
}

// Cofa uchwałę do szkicu (czyści głosy i znaczniki czasu). RESOLUTIONS WRITE.
export async function reopenResolutionDraft(resolutionId: string) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: { organizationId: true, status: true },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  await requireMember(resolution.organizationId, "RESOLUTIONS", "WRITE");

  if (resolution.status === "DRAFT") return;

  await prisma.$transaction([
    prisma.resolutionVote.deleteMany({ where: { resolutionId } }),
    prisma.resolution.update({
      where: { id: resolutionId },
      data: { status: "DRAFT", openedAt: null, decidedAt: null },
    }),
  ]);
  revalidateResolution(resolutionId);
}

// Oddaje (lub zmienia/cofa) głos członka nad uchwałą w trakcie głosowania.
// Ponowny wybór tej samej opcji = wycofanie głosu. Wymaga RESOLUTIONS READ.
export async function castResolutionVote(
  resolutionId: string,
  choice: VoteChoice,
) {
  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    select: { organizationId: true, status: true },
  });
  if (!resolution) throw new Error("Uchwała nie istnieje.");

  const me = await requireMember(resolution.organizationId, "RESOLUTIONS", "READ");

  if (resolution.status !== "VOTING") {
    throw new Error("Głosowanie nad tą uchwałą nie jest otwarte.");
  }

  const existing = await prisma.resolutionVote.findUnique({
    where: { resolutionId_memberId: { resolutionId, memberId: me.id } },
    select: { choice: true },
  });

  if (existing?.choice === choice) {
    await prisma.resolutionVote.delete({
      where: { resolutionId_memberId: { resolutionId, memberId: me.id } },
    });
  } else {
    await prisma.resolutionVote.upsert({
      where: { resolutionId_memberId: { resolutionId, memberId: me.id } },
      create: { resolutionId, memberId: me.id, choice },
      update: { choice },
    });
  }
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
