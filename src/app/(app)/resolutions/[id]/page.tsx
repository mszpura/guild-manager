import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_BADGE,
  tallyVotes,
  voteOutcome,
} from "@/lib/resolutions";
import { ResolutionFormDialog } from "@/components/resolution-form-dialog";
import { AddResolutionToMeeting } from "@/components/resolution-meeting-controls";
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

  const [resolution, voters, resolutionTypes] = await Promise.all([
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
        resolutionTypeId: true,
        resolutionType: {
          select: { name: true, voteThreshold: true, requiresMeeting: true },
        },
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
        // Punkt porządku obrad, na którym uchwała jest głosowana (typ „na spotkaniu").
        agendaItem: {
          select: {
            id: true,
            status: true,
            meeting: {
              select: {
                id: true,
                title: true,
                startsAt: true,
                endedAt: true,
                meetingType: { select: { roles: { select: { roleId: true } } } },
              },
            },
            votes: { select: { memberId: true, choice: true } },
          },
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
        role: { select: { isOwner: true, permissions: true, canVote: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.resolutionType.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        voteThreshold: true,
        requiresMeeting: true,
      },
    }),
  ]);
  if (!resolution) notFound();

  // Uprawnieni do głosowania = dostęp do panelu Uchwały (WRITE) i rola z prawem głosu.
  const eligibleMembers = voters.filter(
    (m) => can(m.role, "RESOLUTIONS", "WRITE") && m.role.canVote,
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
  // Wyniki online ujawniamy dopiero po oddaniu głosu lub po rozstrzygnięciu —
  // przed oddaniem głosu użytkownik nie powinien widzieć bieżącego wyniku.
  const showOnlineResults = myChoice !== null || isDecided;
  // Typ wymagający głosowania na spotkaniu — głosowanie online na razie wyłączone.
  const requiresMeeting = resolution.resolutionType?.requiresMeeting ?? false;
  const meetingItem = resolution.agendaItem;
  // Nadchodzące (niezakończone) spotkania do wyboru — tylko gdy uchwałę można
  // jeszcze dodać (typ „na spotkaniu", szkic, nieprzypisana) i użytkownik zarządza.
  const canAddToMeeting =
    requiresMeeting && isDraft && !meetingItem && isManager;
  const upcomingMeetings = canAddToMeeting
    ? await prisma.meeting.findMany({
        where: { organizationId: orgId, endedAt: null },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true, startsAt: true },
      })
    : [];

  // Głosowanie na spotkaniu — dane do panelu wyniku (w stylu głosowania online).
  const meetingEnded = meetingItem?.meeting.endedAt != null;
  const meetingTally = tallyVotes(meetingItem?.votes ?? []);
  const meetingCast = meetingTally.FOR + meetingTally.AGAINST + meetingTally.ABSTAIN;
  const myMeetingChoice =
    meetingItem?.votes.find((v) => v.memberId === me.id)?.choice ?? null;
  // Liczba uprawnionych do głosowania na tym spotkaniu (rola z prawem głosu oraz
  // dopuszczona przez typ spotkania) — mianownik frekwencji na pasku.
  const meetingAllowedRoleIds =
    meetingItem?.meeting.meetingType.roles.map((r) => r.roleId) ?? [];
  const meetingEligibleCount = meetingItem
    ? await prisma.member.count({
        where: {
          organizationId: orgId,
          role: { is: { canVote: true } },
          ...(meetingAllowedRoleIds.length
            ? { roleId: { in: meetingAllowedRoleIds } }
            : {}),
        },
      })
    : 0;
  // Wynik wyznaczamy z głosów oddanych na spotkaniu i progu z typu uchwały —
  // tylko gdy punkt poddano pod głosowanie (APPROVED) i spotkanie się zakończyło.
  const meetingPassed =
    voteOutcome(meetingTally, resolution.resolutionType?.voteThreshold ?? null) ===
    "PASSED";

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
            {resolution.resolutionType ? (
              <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                {resolution.resolutionType.name} · próg{" "}
                {resolution.resolutionType.voteThreshold}%
              </span>
            ) : null}
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
                resolutionTypes={resolutionTypes}
                resolution={{
                  id: resolution.id,
                  number: resolution.number,
                  title: resolution.title,
                  content: resolution.content ?? "",
                  secretBallot: resolution.secretBallot,
                  resolutionTypeId: resolution.resolutionTypeId,
                }}
              />
            ) : null}
            <ResolutionStatusControls
              resolutionId={resolution.id}
              status={resolution.status}
              hasSignatures={resolution.signatures.length > 0}
              votingDisabled={requiresMeeting}
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
            {requiresMeeting
              ? meetingItem && meetingEnded
                ? `${meetingCast} z ${meetingEligibleCount} głosów`
                : "Na spotkaniu"
              : isDraft
                ? "Nieotwarte"
                : `${castCount} z ${eligibleCount} głosów`}
          </span>
        </div>

        {requiresMeeting ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Ten typ uchwały wymaga głosowania na spotkaniu. Głosowanie online
              jest wyłączone — uchwałę głosuje się jako punkt porządku obrad.
            </p>

            {meetingItem ? (
              <div className="space-y-3">
                <p className="text-sm">
                  {meetingEnded
                    ? "Głosowano na spotkaniu:"
                    : "W porządku obrad spotkania:"}{" "}
                  <Link
                    href={`/meetings/${meetingItem.meeting.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {meetingItem.meeting.title}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    ({dateTimeFmt.format(meetingItem.meeting.startsAt)})
                  </span>
                  .
                </p>

                {/* Panel wyniku w tym samym stylu co głosowanie online — nieaktywny
                    (głos oddaje się na spotkaniu), wynik ujawniany po zakończeniu. */}
                <ResolutionVoteButtons
                  resolutionId={resolution.id}
                  tally={meetingTally}
                  myChoice={myMeetingChoice}
                  canVote={false}
                  eligibleCount={meetingEligibleCount}
                  showResults={meetingEnded}
                />

                {!meetingEnded ? (
                  <p className="text-sm text-muted-foreground">
                    Głos oddaje się na spotkaniu. Wynik pojawi się po jego
                    zakończeniu.
                  </p>
                ) : meetingItem.status === "APPROVED" ? (
                  <p className="text-sm">
                    Wynik:{" "}
                    <strong
                      className={
                        meetingPassed ? "text-emerald-700" : "text-destructive"
                      }
                    >
                      {meetingPassed ? "Przyjęta" : "Odrzucona"}
                    </strong>{" "}
                    ({meetingTally.FOR} za, {meetingTally.AGAINST} przeciw,{" "}
                    {meetingTally.ABSTAIN} wstrzymujących się).
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {meetingItem.status === "REJECTED"
                      ? "Punkt uchwały został odrzucony na spotkaniu — nie przeprowadzono głosowania."
                      : "Uchwały nie poddano pod głosowanie na spotkaniu."}
                  </p>
                )}
              </div>
            ) : canAddToMeeting ? (
              <AddResolutionToMeeting
                resolutionId={resolution.id}
                meetings={upcomingMeetings.map((m) => ({
                  id: m.id,
                  label: `${m.title} — ${dateTimeFmt.format(m.startsAt)}`,
                }))}
              />
            ) : null}
          </div>
        ) : isDraft ? (
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
              canVote={isVoting && me.role.canVote}
              eligibleCount={eligibleCount}
              showResults={showOnlineResults}
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
                {showOnlineResults && resolution.votes.length > 0 ? (
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
