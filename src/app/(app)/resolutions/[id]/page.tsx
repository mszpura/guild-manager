import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_BADGE,
  tallyVotes,
} from "@/lib/resolutions";
import { ResolutionFormDialog } from "@/components/resolution-form-dialog";
import {
  ResolutionVoteButtons,
  ResolutionStatusControls,
  ResolutionDeleteButton,
  ResolutionSignControls,
} from "@/components/resolution-controls";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

const dateTimeFmt = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
  timeStyle: "short",
});

export default async function ResolutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  const me = await requireMember(orgId, "RESOLUTIONS", "READ");
  const isManager = can(me.role, "RESOLUTIONS", "WRITE");

  const [resolution, voters] = await Promise.all([
    prisma.resolution.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        number: true,
        title: true,
        content: true,
        status: true,
        secretBallot: true,
        openedAt: true,
        decidedAt: true,
        votes: {
          orderBy: { createdAt: "asc" },
          select: {
            memberId: true,
            choice: true,
            member: { select: { firstName: true, lastName: true } },
          },
        },
        signatures: {
          orderBy: { signedAt: "asc" },
          select: { role: true, signerName: true, memberId: true },
        },
      },
    }),
    // Uprawnieni do głosowania = członkowie z dostępem do panelu Uchwały w trybie
    // edycji (WRITE). To oni stanowią mianownik dla paska „ile jeszcze nie głosowało".
    prisma.member.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: { select: { isOwner: true, permissions: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);
  if (!resolution) notFound();

  const eligibleMembers = voters.filter((m) =>
    can(m.role, "RESOLUTIONS", "WRITE"),
  );
  const eligibleCount = eligibleMembers.length;
  // Uprawnieni, którzy jeszcze nie oddali głosu (lista pokazywana przy głosowaniu jawnym).
  const votedMemberIds = new Set(resolution.votes.map((v) => v.memberId));
  const notVotedMembers = eligibleMembers.filter(
    (m) => !votedMemberIds.has(m.id),
  );
  const tally = tallyVotes(resolution.votes);
  const myChoice =
    resolution.votes.find((v) => v.memberId === me.id)?.choice ?? null;
  // Tytuł, którym podpisał się bieżący użytkownik (jeśli w ogóle).
  const mySignatureRole =
    resolution.signatures.find((s) => s.memberId === me.id)?.role ?? null;
  const castCount = tally.FOR + tally.AGAINST + tally.ABSTAIN;
  const isVoting = resolution.status === "VOTING";
  const isDraft = resolution.status === "DRAFT";
  const isDecided = resolution.status === "PASSED" || resolution.status === "REJECTED";
  // Dokument PDF dostępny dopiero po zamknięciu głosowania (rozstrzygnięciu).
  const canDownloadPdf = isDecided;
  // Imienne głosy ujawniamy tylko przy głosowaniu jawnym.
  const showVoters = !resolution.secretBallot;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/resolutions" className="hover:text-primary">
          Uchwały
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-mono text-foreground/70">{resolution.number}</span>
      </div>

      {/* nagłówek */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              Uchwała nr {resolution.number}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${RESOLUTION_STATUS_BADGE[resolution.status]}`}
            >
              {RESOLUTION_STATUS_LABELS[resolution.status]}
            </span>
            <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {resolution.secretBallot
                ? "Głosowanie tajne"
                : "Głosowanie jawne"}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">
            {resolution.title}
          </h1>
          <div className="font-mono text-xs text-muted-foreground">
            {isDraft ? "Szkic — głosowanie nieotwarte" : null}
            {isVoting && resolution.openedAt
              ? `Głosowanie otwarte ${dateTimeFmt.format(resolution.openedAt)}`
              : null}
            {isDecided && resolution.decidedAt
              ? `Rozstrzygnięto ${dateTimeFmt.format(resolution.decidedAt)}`
              : null}
          </div>
        </div>

        {isManager ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canDownloadPdf ? (
              <Button asChild variant="outline">
                <Link href={`/resolutions/${resolution.id}/dokument`}>
                  Pobierz PDF
                </Link>
              </Button>
            ) : null}
            {isDraft ? (
              <ResolutionFormDialog
                organizationId={orgId}
                resolution={{
                  id: resolution.id,
                  number: resolution.number,
                  title: resolution.title,
                  content: resolution.content ?? "",
                  secretBallot: resolution.secretBallot,
                }}
              />
            ) : null}
            <ResolutionStatusControls
              resolutionId={resolution.id}
              status={resolution.status}
            />
            <ResolutionDeleteButton
              resolutionId={resolution.id}
              label={`${resolution.number} — ${resolution.title}`}
            />
          </div>
        ) : canDownloadPdf ? (
          <Button asChild variant="outline" className="shrink-0">
            <Link href={`/resolutions/${resolution.id}/dokument`}>Pobierz PDF</Link>
          </Button>
        ) : null}
      </div>

      {/* treść */}
      {resolution.content ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {resolution.content}
          </p>
        </div>
      ) : null}

      {/* głosowanie */}
      <div className="rounded-xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-base font-bold">Głosowanie</h2>
          <span className="text-xs text-muted-foreground">
            {isDraft
              ? "Nieotwarte"
              : `${castCount} z ${eligibleCount} głosów`}
          </span>
        </div>

        {isDraft ? (
          <p className="text-sm text-muted-foreground">
            Głosowanie nie zostało jeszcze otwarte.
            {isManager ? " Użyj „Otwórz głosowanie”, aby rozpocząć." : ""}
          </p>
        ) : (
          <>
            <ResolutionVoteButtons
              resolutionId={resolution.id}
              tally={tally}
              myChoice={myChoice}
              canVote={isVoting}
              eligibleCount={eligibleCount}
            />
            {isDecided ? (
              <p className="mt-4 text-sm">
                Wynik:{" "}
                <strong
                  className={
                    resolution.status === "PASSED"
                      ? "text-emerald-700"
                      : "text-destructive"
                  }
                >
                  {RESOLUTION_STATUS_LABELS[resolution.status]}
                </strong>{" "}
                ({tally.FOR} za, {tally.AGAINST} przeciw, {tally.ABSTAIN}{" "}
                wstrzymujących się).
              </p>
            ) : null}

            {/* imienne głosy — tylko przy głosowaniu jawnym */}
            {showVoters ? (
              <>
                {resolution.votes.length > 0 ? (
                  <div className="mt-5 border-t pt-4">
                    <p className="mb-2 text-[11px] font-bold tracking-wide text-muted-foreground">
                      ODDANE GŁOSY · {resolution.votes.length}
                    </p>
                    <ul className="divide-y">
                      {resolution.votes.map((v) => (
                        <li
                          key={v.memberId}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <span className="font-medium">
                            {v.member.firstName} {v.member.lastName ?? ""}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${VOTE_BADGE[v.choice]}`}
                          >
                            {VOTE_LABEL[v.choice]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* uprawnieni, którzy jeszcze nie oddali głosu */}
                {notVotedMembers.length > 0 ? (
                  <div className="mt-5 border-t pt-4">
                    <p className="mb-2 text-[11px] font-bold tracking-wide text-muted-foreground">
                      JESZCZE NIE ODDALI GŁOSU · {notVotedMembers.length}
                    </p>
                    <ul className="divide-y">
                      {notVotedMembers.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <span className="font-medium text-muted-foreground">
                            {m.firstName} {m.lastName ?? ""}
                          </span>
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            Nie głosował(a)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Głosowanie tajne — imienne głosy nie są ujawniane.
              </p>
            )}
          </>
        )}
      </div>

      {/* podpisy — dostępne po zatwierdzeniu uchwały */}
      {resolution.status === "PASSED" ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-bold">Podpisy</h2>
            <span className="text-xs text-muted-foreground">
              {resolution.signatures.length} z 2
            </span>
          </div>
          <ResolutionSignControls
            resolutionId={resolution.id}
            mySignatureRole={mySignatureRole}
            signatures={resolution.signatures}
          />
        </div>
      ) : null}
    </div>
  );
}

const VOTE_LABEL = {
  FOR: "Za",
  AGAINST: "Przeciw",
  ABSTAIN: "Wstrzymał(a) się",
} as const;

const VOTE_BADGE = {
  FOR: "bg-emerald-50 text-emerald-700",
  AGAINST: "bg-destructive/10 text-destructive",
  ABSTAIN: "bg-muted text-muted-foreground",
} as const;
