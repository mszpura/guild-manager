import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { QUORUM_THRESHOLD, toDateTimeLocalValue } from "@/lib/meetings";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_BADGE,
} from "@/lib/resolutions";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import {
  AgendaDecideControls,
  AttendanceToggle,
  EndMeetingButton,
} from "@/components/meeting-detail-controls";
import {
  AgendaVote,
  AgendaComments,
} from "@/components/meeting-agenda-interactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Clock, MapPin, ChevronRight } from "lucide-react";

const dateFmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" });
const timeFmt = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});
const commentTimeFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type AgendaStatus = "PENDING" | "APPROVED" | "REJECTED";

function initials(firstName: string, lastName: string | null): string {
  return `${firstName.charAt(0)}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  const me = await requireMember(orgId, "MEETINGS", "READ");
  const isManager = can(me.role, "MEETINGS", "WRITE");
  const isOwner = me.role.isOwner; // tylko Prezes może wznowić spotkanie

  const meeting = await prisma.meeting.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      title: true,
      meetingTypeId: true,
      meetingType: {
        select: {
          name: true,
          requiresQuorum: true,
          roles: { select: { roleId: true } },
        },
      },
      startsAt: true,
      isOnline: true,
      location: true,
      endedAt: true,
      agendaItems: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          resolutionId: true,
          resolution: { select: { status: true } },
          votes: { select: { memberId: true, choice: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              text: true,
              createdAt: true,
              authorId: true,
              author: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      attendances: { select: { memberId: true, present: true } },
    },
  });
  if (!meeting) notFound();

  // Lista obecności zawiera wyłącznie członków liczących się do kworum — tj. o
  // rolach z prawem głosu (§17 ust. 3 statutu). Członkowie ról bez prawa głosu
  // (np. Junior) nie są wymagani do kworum, więc nie pojawiają się na liście.
  // Dodatkowo filtrujemy po rolach uprawnionych z typu spotkania (lub wszyscy,
  // gdy typ nie ogranicza ról). Wymóg kworum również wynika z typu spotkania.
  const allowedRoleIds = meeting.meetingType.roles.map((r) => r.roleId);
  const requiresQuorum = meeting.meetingType.requiresQuorum;
  const [members, meetingTypes] = await Promise.all([
    prisma.member.findMany({
      where: {
        organizationId: orgId,
        role: { is: { canVote: true } },
        ...(allowedRoleIds.length ? { roleId: { in: allowedRoleIds } } : {}),
      },
      orderBy: [
        { role: { isOwner: "desc" } },
        { lastName: "asc" },
        { firstName: "asc" },
      ],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: { select: { name: true } },
      },
    }),
    isManager
      ? prisma.meetingType.findMany({
          where: { organizationId: orgId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const presentMap = new Map(meeting.attendances.map((a) => [a.memberId, a.present]));
  const attendees = members.map((m) => ({
    ...m,
    present: presentMap.get(m.id) ?? false,
  }));

  // Wszyscy na liście liczą się do kworum (filtr canVote powyżej), więc frekwencja
  // i kworum opierają się na tym samym zbiorze obecnych.
  const attTotal = attendees.length;
  const presentCount = attendees.filter((a) => a.present).length;
  const quorumPct =
    attTotal > 0 ? Math.round((presentCount / attTotal) * 100) : 0;
  // Gdy typ spotkania nie wymaga kworum, traktujemy je jako zawsze „spełnione”
  // (nie blokuje głosowania).
  const quorumOk = !requiresQuorum || quorumPct >= QUORUM_THRESHOLD;

  const agenda = meeting.agendaItems;
  const approvedCount = agenda.filter((a) => a.status === "APPROVED").length;
  const rejectedCount = agenda.filter((a) => a.status === "REJECTED").length;
  const pendingCount = agenda.filter((a) => a.status === "PENDING").length;
  const decidedCount = approvedCount + rejectedCount;

  const ended = meeting.endedAt !== null;
  const inProgress = !ended && meeting.startsAt <= new Date();

  // Prawo głosu: rola członka ma włączone głosowanie i jest uprawniona (lub spotkanie
  // otwarte dla wszystkich).
  const eligibleToVote =
    me.role.canVote &&
    (allowedRoleIds.length === 0 || allowedRoleIds.includes(me.roleId));
  // Głosowanie otwarte: spotkanie trwa, członek uprawniony i jest kworum.
  const votingOpen = !ended && eligibleToVote && quorumOk;
  const myInitials = initials(me.firstName, me.lastName);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/meetings" className="hover:text-primary">
          Spotkania
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground/70">{meeting.title}</span>
      </div>

      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{meeting.meetingType.name}</Badge>
            {inProgress ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                <span className="size-1.5 rounded-full bg-current" />
                Spotkanie w toku
              </span>
            ) : null}
            {ended ? (
              <Badge variant="outline" className="text-muted-foreground">
                Zakończone
              </Badge>
            ) : null}
          </div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            {meeting.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              {dateFmt.format(meeting.startsAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {timeFmt.format(meeting.startsAt)}
            </span>
            {meeting.location ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {meeting.isOnline ? (
                  <a
                    href={meeting.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {meeting.location}
                  </a>
                ) : (
                  meeting.location
                )}
              </span>
            ) : null}
          </div>
        </div>

        {ended || isManager ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isManager && !ended ? (
              <MeetingFormDialog
                organizationId={orgId}
                meetingTypes={meetingTypes}
                editAsButton
                meeting={{
                  id: meeting.id,
                  title: meeting.title,
                  meetingTypeId: meeting.meetingTypeId,
                  startsAtValue: toDateTimeLocalValue(meeting.startsAt),
                  isOnline: meeting.isOnline,
                  location: meeting.location ?? "",
                  agendaItems: agenda.map((a) => ({
                    id: a.id,
                    title: a.title,
                  })),
                }}
              />
            ) : null}
            {ended ? (
              <Button asChild variant="outline">
                <Link href={`/meetings/${meeting.id}/protokol`}>
                  Pobierz protokół (PDF)
                </Link>
              </Button>
            ) : null}
            {isManager ? (
              <EndMeetingButton
                meetingId={meeting.id}
                ended={ended}
                canReopen={isOwner}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-xl border bg-card p-5">
          <div>
            <StatLabel>FREKWENCJA</StatLabel>
            <div className="font-heading text-2xl font-extrabold leading-none">
              {presentCount} / {attTotal}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">obecnych członków</div>
          </div>
          {!requiresQuorum ? (
            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              Bez kworum
            </span>
          ) : attTotal > 0 ? (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                quorumOk
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {quorumOk ? "Kworum ✓" : "Brak kworum"}
            </span>
          ) : null}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <StatLabel>PUNKTY PORZĄDKU</StatLabel>
          <div className="font-heading text-2xl font-extrabold leading-none">
            {agenda.length}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {decidedCount} rozpatrzonych
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <StatLabel>DECYZJE</StatLabel>
          <div className="flex items-baseline gap-4">
            <span className="font-heading text-2xl font-extrabold leading-none text-emerald-600">
              {approvedCount}
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                zatw.
              </span>
            </span>
            <span className="font-heading text-2xl font-extrabold leading-none text-destructive">
              {rejectedCount}
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                odrz.
              </span>
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {pendingCount} oczekuje na głosowanie
          </div>
        </div>
      </div>

      {/* two columns */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.65fr_1fr]">
        {/* LEFT: agenda */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h3 className="font-heading text-base font-bold">Porządek obrad</h3>
            <span className="text-sm text-muted-foreground">
              {agenda.length} punktów
            </span>
          </div>
          {agenda.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Brak punktów porządku obrad.
            </p>
          ) : (
            agenda.map((item, i) => {
              const tally = {
                FOR: item.votes.filter((v) => v.choice === "FOR").length,
                AGAINST: item.votes.filter((v) => v.choice === "AGAINST").length,
                ABSTAIN: item.votes.filter((v) => v.choice === "ABSTAIN").length,
              };
              const myChoice =
                item.votes.find((v) => v.memberId === me.id)?.choice ?? null;
              const comments = item.comments.map((c) => ({
                id: c.id,
                author: `${c.author.firstName} ${c.author.lastName ?? ""}`.trim(),
                initials: initials(c.author.firstName, c.author.lastName),
                time: commentTimeFmt.format(c.createdAt),
                text: c.text,
                canDelete: c.authorId === me.id || isManager,
              }));

              return (
                <div key={item.id} className="border-b px-5 py-5 last:border-0">
                  <div className="flex gap-3.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand font-heading text-[13px] font-extrabold text-brand-foreground">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-[15px] font-bold leading-snug">
                            {item.title}
                          </h4>
                          {item.resolutionId ? (
                            <Link
                              href={`/resolutions/${item.resolutionId}`}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                              Uchwała — przejdź do szczegółów
                            </Link>
                          ) : null}
                        </div>
                        {/* Dla punktu-uchwały pokazujemy status samej uchwały
                            (wynik wg jej progu), a nie surową decyzję o punkcie. */}
                        {item.resolution ? (
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${RESOLUTION_STATUS_BADGE[item.resolution.status]}`}
                          >
                            {RESOLUTION_STATUS_LABELS[item.resolution.status]}
                          </span>
                        ) : (
                          <AgendaStatusBadge status={item.status} />
                        )}
                      </div>
                      {item.description ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}

                      {item.resolutionId ? (
                        <AgendaVote
                          itemId={item.id}
                          tally={tally}
                          myChoice={myChoice}
                          canVote={votingOpen && item.status === "APPROVED"}
                          showResults={ended || myChoice !== null}
                          note={
                            ended
                              ? undefined
                              : item.status === "PENDING"
                                ? "Głosowanie otwiera się po zatwierdzeniu punktu przez prowadzącego."
                                : item.status === "REJECTED"
                                  ? "Punkt odrzucony — głosowanie zamknięte."
                                  : eligibleToVote && !quorumOk
                                    ? `Brak kworum (${quorumPct}%) — głosowanie wstrzymane.`
                                    : undefined
                          }
                        />
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Punkt informacyjny — bez głosowania.
                        </p>
                      )}

                      {isManager ? (
                        <AgendaDecideControls
                          itemId={item.id}
                          status={item.status}
                          ended={ended}
                          isResolution={item.resolutionId !== null}
                          hasVotes={item.votes.length > 0}
                        />
                      ) : null}

                      <AgendaComments
                        itemId={item.id}
                        comments={comments}
                        myInitials={myInitials}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT: attendance */}
        <div className="overflow-hidden rounded-xl border bg-card lg:sticky lg:top-[80px]">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h3 className="font-heading text-base font-bold">Lista obecności</h3>
            <span className="text-sm font-semibold text-foreground/70">
              {presentCount} / {attTotal}
            </span>
          </div>

          {/* quorum bar — tylko gdy typ spotkania wymaga kworum */}
          {requiresQuorum ? (
            <div className="border-b px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Kworum ({quorumPct}%)</span>
                <span
                  className={`font-semibold ${
                    quorumOk ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {quorumOk ? "Spełnione" : "Niespełnione"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    quorumOk ? "bg-emerald-600" : "bg-amber-500"
                  }`}
                  style={{ width: `${quorumPct}%` }}
                />
              </div>
            </div>
          ) : null}

          {attendees.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Brak uprawnionych członków.
            </p>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {attendees.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 border-b px-5 py-3 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      {initials(p.firstName, p.lastName)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {p.firstName} {p.lastName ?? ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.role.name}
                      </div>
                    </div>
                  </div>
                  {isManager && !ended ? (
                    <AttendanceToggle
                      meetingId={meeting.id}
                      memberId={p.id}
                      present={p.present}
                    />
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        p.present
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.present ? "Obecny" : "Nieobecny"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-bold tracking-[0.04em] text-muted-foreground">
      {children}
    </div>
  );
}

function AgendaStatusBadge({ status }: { status: AgendaStatus }) {
  const map = {
    APPROVED: ["Zatwierdzony", "bg-emerald-50 text-emerald-700"],
    REJECTED: ["Odrzucony", "bg-destructive/10 text-destructive"],
    PENDING: ["Do rozpatrzenia", "bg-amber-50 text-amber-700"],
  } as const;
  const [label, cls] = map[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
